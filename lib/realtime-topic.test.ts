import { describe, expect, it, vi } from "vitest";

import {
  onRealtimeRekey,
  resolveRealtimeTopic,
  signalRealtimeRekey,
  signalRealtimeRevalidate,
  watchRealtimeTopic,
} from "./realtime-topic";

describe("resolveRealtimeTopic", () => {
  it("returns the generation selected by the authorization RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: "project:00000000-0000-4000-8000-000000000001:v:4",
      error: null,
    });

    await expect(
      resolveRealtimeTopic({ rpc } as never, "project:logical"),
    ).resolves.toBe("project:00000000-0000-4000-8000-000000000001:v:4");
    expect(rpc).toHaveBeenCalledWith("resolve_realtime_topic", {
      p_topic: "project:logical",
    });
  });

  it("fails closed when authorization or resolution fails", async () => {
    const denied = new Error("denied");
    await expect(
      resolveRealtimeTopic(
        {
          rpc: vi.fn().mockResolvedValue({ data: null, error: denied }),
        } as never,
        "project:logical",
      ),
    ).rejects.toBe(denied);

    await expect(
      resolveRealtimeTopic(
        {
          rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as never,
        "project:logical",
      ),
    ).rejects.toThrow("returned no topic");
  });
});

describe("Realtime rekey signals", () => {
  it("reconnects every listener once for duplicate signals in one turn", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onRealtimeRekey(first);
    const stopSecond = onRealtimeRekey(second);

    signalRealtimeRekey();
    signalRealtimeRekey();
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(second).toHaveBeenCalledTimes(1);

    stopFirst();
    signalRealtimeRekey();
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(2));
    expect(first).toHaveBeenCalledTimes(1);
    stopSecond();
  });
});

describe("Realtime resume revalidation", () => {
  const topic = (data: unknown, error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });

  it("reconnects only channels that left the current generation, and only on rekey otherwise", async () => {
    const cases = [
      { name: "unchanged", client: topic("project:p:v:1"), channel: { state: "joined" }, reconnects: 0 },
      { name: "new generation", client: topic("project:p:v:2"), channel: { state: "joined" }, reconnects: 1 },
      { name: "denied", client: topic(null, { code: "42501" }), channel: { state: "joined" }, reconnects: 1 },
      { name: "not joined", client: topic("project:p:v:1"), channel: { state: "errored" }, reconnects: 1 },
    ];
    const watched = cases.map((entry) => {
      const reconnect = vi.fn();
      const stop = watchRealtimeTopic(entry.client as never, "project:p",
        () => ({ resolved: "project:p:v:1", channel: entry.channel, version: 1 }), reconnect);
      return { ...entry, reconnect, stop };
    });
    signalRealtimeRevalidate();
    signalRealtimeRevalidate();
    await vi.waitFor(() => expect(watched.map((entry) => entry.reconnect.mock.calls.length)).toEqual(cases.map((entry) => entry.reconnects)));
    expect(watched[3].client.rpc).not.toHaveBeenCalled();
    expect(watched[0].client.rpc).toHaveBeenCalledTimes(1);
    signalRealtimeRekey();
    await vi.waitFor(() => expect(watched[0].reconnect).toHaveBeenCalledTimes(1));
    for (const entry of watched) entry.stop();
  });

  it("leaves a channel alone when it reconnected while the check was in flight", async () => {
    let version = 1;
    const reconnect = vi.fn();
    const stop = watchRealtimeTopic({ rpc: vi.fn(async () => { version = 2; return { data: "project:p:v:2", error: null }; }) } as never,
      "project:p", () => ({ resolved: "project:p:v:1", channel: { state: "joined" }, version }), reconnect);
    signalRealtimeRevalidate();
    await new Promise((done) => setTimeout(done, 0));
    expect(reconnect).not.toHaveBeenCalled();
    stop();
  });
});
