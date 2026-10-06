// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeProvider } from "./realtime-provider";
import { signalRealtimeRekey } from "./realtime-topic";

const realtime = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  setAuth: vi.fn(async () => {}),
  authListeners: new Set<(event: AuthChangeEvent) => void>(),
}));
vi.mock("./supabase", () => ({ getSupabase: () => ({
  rpc: realtime.rpc,
  channel: realtime.channel,
  removeChannel: realtime.removeChannel,
  realtime: { setAuth: realtime.setAuth },
  auth: { onAuthStateChange: (listener: (event: AuthChangeEvent) => void) => {
    realtime.authListeners.add(listener);
    return { data: { subscription: { unsubscribe: () =>
      realtime.authListeners.delete(listener) } } };
  } },
}) }));
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("./desktop/bridge", () => ({ getDesktopBridge: () => null }));
vi.mock("./desktop/trace", () => ({ trace: vi.fn() }));

const denied = { code: "42501", message: "Realtime topic access denied" };
let root: Root;
let client: QueryClient;
let mounted: boolean;

function requests(topic: string) {
  return realtime.rpc.mock.calls.filter(([, args]) => args.p_topic === topic).length;
}
function resolve(projectError: unknown = null) {
  realtime.rpc.mockImplementation(async (_name, { p_topic }: { p_topic: string }) =>
    p_topic === "project:project-1" && projectError
      ? { data: null, error: projectError }
      : { data: `${p_topic}:v:1`, error: null });
}
async function mount() {
  mounted = true;
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(RealtimeProvider, { children: createElement("span", null, "Ready") }))));
}
async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}
async function auth(event: AuthChangeEvent) {
  await act(async () => {
    for (const listener of realtime.authListeners) listener(event);
  });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  realtime.authListeners.clear();
  realtime.channel.mockImplementation(() => {
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((listener) => listener("SUBSCRIBED")),
    };
    return channel;
  });
  resolve();
  root = createRoot(document.createElement("div"));
  mounted = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["projects"], [{ id: "project-1", updated_at: "", deleted_at: null }]);
});
afterEach(async () => {
  if (mounted) await act(() => root.unmount());
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Realtime authorization recovery", () => {
  it("stops denied project retries and repeated cache refreshes while the user channel stays live", async () => {
    resolve(denied);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await mount();
    await advance(1_000);
    expect(requests("project:project-1")).toBe(1);
    expect(realtime.channel).toHaveBeenCalledTimes(1);
    expect(realtime.channel).toHaveBeenCalledWith("user:user-1:v:1", { config: { private: true } });
    const refreshes = invalidate.mock.calls.length;
    expect(refreshes).toBeGreaterThan(0);
    await advance(60_000);
    expect(requests("project:project-1")).toBe(1);
    expect(invalidate).toHaveBeenCalledTimes(refreshes);
  });

  it("retries transient database failures with backoff and joins after recovery", async () => {
    resolve({ code: "57014", message: "Statement timeout" });
    await mount();
    await advance(999);
    expect(requests("project:project-1")).toBe(1);
    resolve();
    await advance(1);
    expect(requests("project:project-1")).toBe(2);
    expect(realtime.channel).toHaveBeenCalledWith("project:project-1:v:1", { config: { private: true } });
  });

  it.each(["SIGNED_IN", "TOKEN_REFRESHED"] as const)("wakes only denied scopes after %s", async (event) => {
    resolve(denied);
    await mount();
    resolve();
    await auth(event);
    expect(requests("project:project-1")).toBe(2);
    expect(requests("user:user-1")).toBe(1);
    expect(realtime.removeChannel).not.toHaveBeenCalled();
    await auth(event);
    expect(requests("project:project-1")).toBe(2);
  });

  it("rechecks denied membership after a rekey and permits a restored private subscription", async () => {
    resolve(denied);
    await mount();
    resolve();
    await act(async () => signalRealtimeRekey());
    expect(requests("project:project-1")).toBe(2);
    expect(realtime.channel).toHaveBeenCalledWith("project:project-1:v:1", { config: { private: true } });
  });

  it("removes authorization listeners and pending retries on unmount", async () => {
    resolve({ code: "57014" });
    await mount();
    await act(() => root.unmount());
    mounted = false;
    expect(realtime.authListeners.size).toBe(0);
    await auth("TOKEN_REFRESHED");
    await act(async () => signalRealtimeRekey());
    await advance(60_000);
    expect(requests("project:project-1")).toBe(1);
  });

  it("does not resolve a topic after unmounting while socket authentication is pending", async () => {
    let authenticate!: () => void;
    realtime.setAuth.mockImplementationOnce(() => new Promise<void>((done) => {
      authenticate = done;
    }));
    await mount();
    expect(requests("user:user-1")).toBe(0);
    await act(() => root.unmount());
    mounted = false;
    await act(async () => authenticate());
    expect(requests("user:user-1")).toBe(0);
  });

  it("ignores a stale denial after a newer subscription has succeeded", async () => {
    let finish!: (value: unknown) => void;
    realtime.rpc.mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    await mount();
    await act(async () => signalRealtimeRekey());
    expect(requests("user:user-1")).toBe(2);
    await act(async () => finish({ data: null, error: denied }));
    await auth("TOKEN_REFRESHED");
    await advance(60_000);
    expect(requests("user:user-1")).toBe(2);
  });
});
