// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import type { AuthChangeEvent } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeProvider } from "./realtime-provider";
import { signalRealtimeRekey } from "./realtime-topic";
import { recordAcceptedPageWrite } from "./optimistic-page-writes";

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
  it("ignores broadcasts and rekey events from retired channels after a reconnect", async () => {
    await mount();
    const retired = realtime.channel.mock.results[0].value;
    await advance(400);
    await act(async () => signalRealtimeRekey());
    await advance(400);
    const channelCount = realtime.channel.mock.calls.length;
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const broadcast = retired.on.mock.calls.find(([, filter]: [unknown, { event: string }]) => filter.event === "INSERT")![2];
    const rekey = retired.on.mock.calls.find(([, filter]: [unknown, { event: string }]) => filter.event === "rekey")![2];
    await act(async () => {
      broadcast({ payload: { operation: "INSERT", table: "notifications", record: { id: "late" } } });
      rekey();
    });
    await advance(400);
    expect(realtime.channel).toHaveBeenCalledTimes(channelCount);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("ignores retired channel statuses so they cannot schedule another current-channel catch-up", async () => {
    await mount();
    const retired = realtime.channel.mock.results[0].value;
    await advance(400);
    await act(async () => signalRealtimeRekey());
    await advance(400);
    const current = realtime.channel.mock.results[2].value;
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      retired.subscribe.mock.calls[0][0]("CLOSED");
      current.subscribe.mock.calls[0][0]("SUBSCRIBED");
    });
    await advance(400);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("ignores already queued native socket callbacks after the provider unmounts", async () => {
    await mount();
    const retired = realtime.channel.mock.results[0].value;
    await advance(400);
    await act(() => root.unmount());
    mounted = false;
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const broadcast = retired.on.mock.calls.find(([, filter]: [unknown, { event: string }]) => filter.event === "INSERT")![2];
    await act(async () => broadcast({ payload: { operation: "INSERT", table: "notifications", record: { id: "late" } } }));
    await advance(400);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each(["authentication", "topic resolution"])(
    "retries a stalled %s and ignores its late completion", async (phase) => {
      let finish!: () => void;
      if (phase === "authentication") {
        realtime.setAuth.mockImplementationOnce(() => new Promise<void>((done) => { finish = done; }));
      } else {
        realtime.rpc.mockImplementationOnce(() => new Promise((done) => {
          finish = () => done({ data: "user:user-1:v:obsolete", error: null });
        }));
      }
      await mount();
      expect(realtime.channel).not.toHaveBeenCalledWith("user:user-1:v:1", expect.anything());
      // Bound the complete SDK operation, including its internal session lock,
      // then give the normal first retry its one-second backoff.
      await advance(9_000);
      expect(realtime.channel).toHaveBeenCalledWith("user:user-1:v:1", { config: { private: true } });
      const channels = realtime.channel.mock.calls.length;
      const topics = requests("user:user-1");
      await act(async () => finish());
      expect(realtime.channel).toHaveBeenCalledTimes(channels);
      expect(requests("user:user-1")).toBe(topics);
      await advance(60_000);
      expect(realtime.channel).toHaveBeenCalledTimes(channels);
    },
  );

  it("cancels pending authorization deadlines when all scopes unmount", async () => {
    realtime.setAuth.mockImplementationOnce(() => new Promise<void>(() => {}));
    await mount();
    await advance(400);
    await act(() => root.unmount());
    mounted = false;
    client.clear();
    expect(vi.getTimerCount()).toBe(0);
    await advance(60_000);
    expect(requests("user:user-1")).toBe(0);
  });

  it("recovers active usage after a brief focus switch and leaves healthy and inactive reads alone", async () => {
    await mount();
    await advance(400);
    const usageRead = vi.fn(async () => ({ remainingPercent: 90 }));
    const healthyRead = vi.fn(async () => "healthy");
    const inactiveRead = vi.fn(async () => "inactive");
    client.setQueryData(["billing", "usage"], { remainingPercent: 95 });
    client.setQueryData(["page", "page-1"], "healthy");
    client.setQueryDefaults(["inactive"], { queryFn: inactiveRead });
    client.setQueryData(["inactive"], "inactive");
    const usage = new QueryObserver(client, { queryKey: ["billing", "usage"], queryFn: usageRead, staleTime: Infinity });
    const healthy = new QueryObserver(client, { queryKey: ["page", "page-1"], queryFn: healthyRead, staleTime: Infinity });
    const stopUsage = usage.subscribe(() => {});
    const stopHealthy = healthy.subscribe(() => {});
    client.getQueryCache().find({ queryKey: ["billing", "usage"] })!.setState({ status: "error", error: new Error("Network unavailable") });
    client.getQueryCache().find({ queryKey: ["inactive"] })!.setState({ status: "error", error: new Error("Network unavailable") });
    try {
      await act(async () => window.dispatchEvent(new Event("blur")));
      await advance(100);
      await act(async () => window.dispatchEvent(new Event("focus")));
      expect(usageRead).toHaveBeenCalledTimes(1);
      expect(usage.getCurrentResult().data).toEqual({ remainingPercent: 90 });
      expect(healthyRead).not.toHaveBeenCalled();
      expect(inactiveRead).not.toHaveBeenCalled();
    } finally { stopUsage(); stopHealthy(); }
  });

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

describe("own page write echoes", () => {
  const page = (version: number, updatedAt: string) => ({ id: "page-1", project_id: "project-1", version, updated_at: updatedAt });
  const at = "2026-10-15T10:00:00.123456+00:00", later = "2026-10-15T10:00:02.000000+00:00";
  const DOCUMENT_KEYS = [["page", "page-1"], ["pages", "project-1"], ["app-tab-metadata"]].map((key) => JSON.stringify(key));
  async function projectUpdates() {
    await mount();
    await advance(1_000);
    const index = realtime.channel.mock.calls.findIndex(([topic]) => topic === "project:project-1:v:1");
    const channel = realtime.channel.mock.results[index].value;
    const update = channel.on.mock.calls.find(([, filter]: [unknown, { event: string }]) => filter.event === "UPDATE")![2];
    return (record: ReturnType<typeof page>) => act(async () => update({ payload: {
      operation: "UPDATE", table: "pages", schema: "public", record, old_record: page(record.version - 1, at) } }));
  }
  function watchInvalidations() {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    return () => invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  }

  it("skips the refetches an acknowledgement landing after its broadcast already wrote", async () => {
    const update = await projectUpdates();
    const invalidated = watchInvalidations();
    // The broadcast leaves at commit, a few milliseconds before the PATCH response.
    await update(page(17, at));
    recordAcceptedPageWrite(client, page(17, at), ["content", "version"]);
    await advance(250);
    expect(invalidated().filter((key) => DOCUMENT_KEYS.includes(key))).toEqual([]);
    expect(invalidated()).toContain(JSON.stringify(["me", "search-index"]));
  });

  it("still refetches a remote version, alone or coalesced with an own echo", async () => {
    const update = await projectUpdates();
    recordAcceptedPageWrite(client, page(17, at), ["content", "version"]);
    const invalidated = watchInvalidations();
    await update(page(18, later));
    await advance(250);
    expect(invalidated()).toEqual(expect.arrayContaining(DOCUMENT_KEYS));
    const before = invalidated().length;
    await update(page(17, at));
    await update(page(18, later));
    await advance(250);
    expect(invalidated().slice(before)).toEqual(expect.arrayContaining(DOCUMENT_KEYS));
  });
});
