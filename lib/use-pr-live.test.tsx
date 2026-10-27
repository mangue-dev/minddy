// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  handlers: new Map<string, (message: { payload: unknown }) => void>(),
  subscribe: vi.fn(),
}));
vi.mock("./supabase", () => ({
  getSupabase: () => ({
    realtime: { setAuth: async () => {} },
    channel: () => {
      const channel = {
        on: (_type: string, { event }: { event: string }, handler: (message: { payload: unknown }) => void) => {
          h.handlers.set(event, handler);
          return channel;
        },
        subscribe: h.subscribe,
      };
      return channel;
    },
    removeChannel: async () => {},
  }),
}));
vi.mock("./realtime-topic", () => ({
  resolveRealtimeTopic: async (_client: unknown, topic: string) => topic,
  signalRealtimeRekey: () => {},
  watchRealtimeTopic: () => () => {},
}));

const { INVALIDATE_FOLLOW_UP_MS, usePrLive } = await import("./use-pr-live");

let root: Root;
let client: QueryClient;
function Live() {
  usePrLive("pr-1");
  return null;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h.handlers.clear();
  client = new QueryClient();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<QueryClientProvider client={client}><Live /></QueryClientProvider>));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("usePrLive (MIN-817)", () => {
  it("rereads once quickly, then once more after the forge settles, for a whole burst", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const changed = h.handlers.get("changed")!;
    expect(changed).toBeDefined();
    changed({ payload: { parts: ["commits"] } });
    await vi.advanceTimersByTimeAsync(200);
    changed({ payload: { parts: ["commits"] } });
    await vi.advanceTimersByTimeAsync(400);
    expect(invalidate).toHaveBeenCalledTimes(1);
    // The follow-up waits for the last message of the burst.
    await vi.advanceTimersByTimeAsync(INVALIDATE_FOLLOW_UP_MS - 600);
    expect(invalidate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ["pr-commits", "pr-1"] });
    await vi.advanceTimersByTimeAsync(INVALIDATE_FOLLOW_UP_MS * 2);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("reports a channel that fails to join", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const onStatus = h.subscribe.mock.calls.at(-1)![0] as (status: string, error?: Error) => void;
    onStatus("CHANNEL_ERROR", new Error("denied"));
    expect(warn).toHaveBeenCalledWith("[pr-live] subscribe_failed", "CHANNEL_ERROR", "denied");
    onStatus("SUBSCRIBED");
    expect(warn).toHaveBeenCalledOnce();
  });
});
