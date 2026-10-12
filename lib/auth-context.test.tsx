// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { AuthProvider, useAuth } from "./auth-context";

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  callback: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
  analytics: { identify: vi.fn(), reset: vi.fn(), track: vi.fn() },
  clearCache: vi.fn(),
  clearTabs: vi.fn(),
  sdk: null as SupabaseClient | null,
}));
vi.mock("./supabase", () => ({ getSupabase: () => h.sdk ?? ({ auth: {
  getSession: h.getSession,
  onAuthStateChange: (callback: typeof h.callback) => {
    h.callback = callback;
    return { data: { subscription: { unsubscribe: h.unsubscribe } } };
  },
} }) }));
vi.mock("./query-provider", () => ({ clearPersistedQueryCache: h.clearCache }));
vi.mock("./app-tabs-storage", () => ({ clearAppTabsWindowState: h.clearTabs }));
vi.mock("./use-analytics", () => ({ useAnalytics: () => h.analytics }));
vi.mock("./runtime-config-provider", () => ({ browserRuntimeConfig: () => ({
  supabaseUrl: "https://synthetic.supabase.co", supabaseAnonKey: "public",
}) }));
vi.mock("./interface-locale", () => ({ readInterfaceLocale: () => "en" }));

const savedSession = (id = "owner") => ({
  access_token: `token-${id}`, refresh_token: "retained-refresh", expires_in: 3_600, token_type: "bearer",
  user: { id, aud: "authenticated", created_at: "2026-01-01T00:00:00Z", user_metadata: { locale: "en" }, app_metadata: {} },
}) satisfies Session;
const result = (session: Session | null = null, error: unknown = null) => ({ data: { session }, error });
const transientFailure = () => Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError" });
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let mounted: boolean;
function Snapshot() {
  const { user, session, loading } = useAuth();
  return <output>{JSON.stringify({ owner: user?.id ?? null, token: session?.access_token ?? null, loading })}</output>;
}
const snapshot = () => JSON.parse(host.textContent!);
async function emit(event: AuthChangeEvent, session: Session | null) {
  await act(async () => { h.callback!(event, session); });
}
async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
async function dispatch(type: string) {
  await act(async () => { window.dispatchEvent(new Event(type)); });
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ external: {} })));
  h.getSession.mockReset().mockResolvedValue(result());
  h.sdk = null;
  h.clearCache.mockClear(); h.clearTabs.mockClear(); h.unsubscribe.mockClear();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host); mounted = true;
  await act(async () => { root.render(<AuthProvider><Snapshot /></AuthProvider>); });
});
afterEach(async () => {
  if (mounted) await act(async () => { root.unmount(); });
  h.sdk?.auth.stopAutoRefresh();
  host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("browser session recovery", () => {
  it("keeps startup loading until a null initial event is confirmed by the session read", async () => {
    let finish!: (value: ReturnType<typeof result>) => void;
    h.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await emit("INITIAL_SESSION", null);
    await advance(0);
    expect(snapshot().loading).toBe(true);
    await act(async () => { finish(result(savedSession())); });
    expect(snapshot()).toEqual({ owner: "owner", token: "token-owner", loading: false });
  });

  it("lets confirmed missing credentials leave the startup loading state", async () => {
    await emit("INITIAL_SESSION", null);
    await advance(0);
    expect(snapshot()).toEqual({ owner: null, token: null, loading: false });
  });

  it("recovers an expired cookie with the actual SDK after an offline desktop startup", async () => {
    const cookies = new Map<string, string>();
    const token = (expiresAt: number) => [
      { alg: "HS256", typ: "JWT" }, { sub: "owner", exp: expiresAt, session_id: "session" },
    ].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".") + ".signature";
    cookies.set("test-session", JSON.stringify({ ...savedSession(), access_token: token(1), expires_at: 1 }));
    let online = false;
    const refresh = vi.fn(async () => online
      ? Response.json({ ...savedSession(), access_token: token(Math.floor(Date.now() / 1000) + 3_600), refresh_token: "recovered-refresh" })
      : Response.json({ message: "Backend unavailable" }, { status: 503 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      h.sdk = createBrowserClient("https://synthetic.supabase.co", "synthetic-anon-key", {
        isSingleton: false, cookieOptions: { name: "test-session" }, cookieEncoding: "raw",
        cookies: {
          getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
          setAll: values => { values.forEach(({ name, value }) => cookies.set(name, value)); },
        },
        auth: { autoRefreshToken: true, detectSessionInUrl: false },
        global: { fetch: refresh },
      });
      const events: { event: string; session: unknown }[] = [];
      const { data: { subscription } } = h.sdk.auth.onAuthStateChange((event, session) => {
        events.push({ event, session });
      });
      await act(async () => { root.render(<AuthProvider key="sdk"><Snapshot /></AuthProvider>); });
      await advance(35_000);
      await h.sdk.auth.initialize();
      h.sdk.auth.stopAutoRefresh();
      expect(events).toContainEqual({ event: "INITIAL_SESSION", session: null });
      expect(cookies.get("test-session")).toContain("retained-refresh");
      expect(snapshot().owner).toBeNull();
      online = true;
      await dispatch("online");
      // The SDK caches failed renewals for a minute. Recovery must keep retrying
      // after its automatic ticker is stopped, without a sign-out or reload.
      await advance(65_000);
      expect(snapshot().owner).toBe("owner");
      expect(snapshot().loading).toBe(false);
      expect(cookies.get("test-session")).toContain("recovered-refresh");
      subscription.unsubscribe();
    } finally {
      warn.mockRestore();
    }
  });

  it("restores a retained session after transient startup refresh failure without signing in again", async () => {
    h.getSession.mockResolvedValueOnce(result(null, transientFailure())).mockResolvedValueOnce(result(savedSession()));
    await emit("INITIAL_SESSION", null);
    expect(h.getSession).not.toHaveBeenCalled();
    await advance(0);
    expect(snapshot().owner).toBeNull();
    await advance(8_000);
    expect(snapshot()).toEqual({ owner: "owner", token: "token-owner", loading: false });
    expect(h.getSession).toHaveBeenCalledTimes(2);
  });

  it("recovers on network return and coalesces simultaneous foreground events", async () => {
    h.getSession.mockResolvedValueOnce(result(null, transientFailure()));
    await emit("INITIAL_SESSION", null); await advance(0);
    let finish!: (value: ReturnType<typeof result>) => void;
    h.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await dispatch("online"); await dispatch("focus");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(h.getSession).toHaveBeenCalledTimes(2);
    await act(async () => { finish(result(savedSession())); });
    expect(snapshot().owner).toBe("owner");
    await advance(8_000);
    expect(h.getSession).toHaveBeenCalledTimes(2);
  });

  it("actively checks the session when the initial auth event misses the watchdog", async () => {
    h.getSession.mockResolvedValueOnce(result(savedSession()));
    await advance(8_000);
    expect(snapshot().owner).toBe("owner");
    expect(snapshot().loading).toBe(false);
  });

  it("releases a stalled session read so network return can recover and ignores its late result", async () => {
    let finish!: (value: ReturnType<typeof result>) => void;
    h.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await emit("INITIAL_SESSION", null);
    await advance(0);
    await advance(8_000);
    h.getSession.mockResolvedValueOnce(result(savedSession()));
    await dispatch("online");
    expect(h.getSession).toHaveBeenCalledTimes(2);
    expect(snapshot().owner).toBe("owner");
    await act(async () => { finish(result(null)); });
    expect(snapshot().owner).toBe("owner");
    expect(h.clearCache).not.toHaveBeenCalled();
    await advance(16_000);
    expect(h.getSession).toHaveBeenCalledTimes(2);
  });

  it("cancels the recovery deadline when unmounting during a stalled session read", async () => {
    h.getSession.mockImplementationOnce(() => new Promise(() => {}));
    await emit("INITIAL_SESSION", null);
    await advance(0);
    await act(async () => { root.unmount(); }); mounted = false;
    expect(vi.getTimerCount()).toBe(0);
    await advance(16_000);
    expect(h.getSession).toHaveBeenCalledTimes(1);
  });

  it.each(["SIGNED_OUT", "SIGNED_IN"] as const)("ignores a late session read after %s", async event => {
    await emit("INITIAL_SESSION", savedSession());
    let finish!: (value: ReturnType<typeof result>) => void;
    h.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await dispatch("focus");
    await emit(event, event === "SIGNED_IN" ? savedSession("other") : null);
    await act(async () => { finish(result(savedSession())); });
    expect(snapshot().owner).toBe(event === "SIGNED_IN" ? "other" : null);
    expect(h.clearCache).toHaveBeenCalledOnce();
    expect(h.clearTabs).toHaveBeenCalledOnce();
  });

  it("preserves the known account when a foreground read fails transiently", async () => {
    await emit("INITIAL_SESSION", savedSession());
    h.getSession.mockResolvedValueOnce(result(null, transientFailure()));
    await dispatch("focus");
    expect(snapshot().owner).toBe("owner");
    expect(h.clearCache).not.toHaveBeenCalled();
  });

  it("does not clear a known account for a null initial notification during refresh", async () => {
    await emit("SIGNED_IN", savedSession());
    let finish!: (value: ReturnType<typeof result>) => void;
    h.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await dispatch("focus");
    await emit("INITIAL_SESSION", null); await advance(0);
    await act(async () => { finish(result(null, transientFailure())); });
    expect(snapshot().owner).toBe("owner");
    expect(h.clearCache).not.toHaveBeenCalled();
    h.getSession.mockResolvedValueOnce(result(savedSession()));
    await advance(8_000);
    expect(h.getSession).toHaveBeenCalledTimes(2);
    expect(snapshot().owner).toBe("owner");
  });

  it.each([null, Object.assign(new Error("Invalid refresh token"), { status: 400 })])(
    "does not poll absent or permanently rejected sessions: %s", async error => {
      h.getSession.mockResolvedValueOnce(result(null, error));
      await emit("INITIAL_SESSION", null); await advance(0); await advance(80_000);
      expect(h.getSession).toHaveBeenCalledTimes(1);
      expect(snapshot().owner).toBeNull();
    },
  );

  it("removes recovery listeners and retry timers when the provider unmounts", async () => {
    h.getSession.mockResolvedValueOnce(result(null, transientFailure()));
    await emit("INITIAL_SESSION", null); await advance(0);
    await act(async () => { root.unmount(); }); mounted = false;
    await dispatch("online"); await dispatch("focus"); await advance(80_000);
    expect(h.getSession).toHaveBeenCalledTimes(1);
    expect(h.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
