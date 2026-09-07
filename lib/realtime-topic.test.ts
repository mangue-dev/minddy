import { describe, expect, it, vi } from "vitest";

import {
  onRealtimeRekey,
  resolveRealtimeTopic,
  signalRealtimeRekey,
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
