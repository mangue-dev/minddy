import { afterEach, describe, expect, it, vi } from "vitest";

const { broadcastToTopic, broadcastRunEvent } = await import("./live");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("agent live Realtime transport", () => {
  it("refuses agent stream content before calling the database broadcaster", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");

    // @ts-expect-error Exercise an obsolete JavaScript caller.
    await broadcastToTopic("agent-run:run-id", "stream", { text: "partial" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps event content out of the broadcast", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
    broadcastRunEvent("run-id", { id: "event-id", type: "summary" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://supabase.example.test/rest/v1/rpc/broadcast_private_realtime");
    expect(JSON.parse(String(request.body))).toEqual({
      p_topic: "agent-run:run-id", p_event: "event",
      p_payload: { id: "event-id", type: "summary" },
    });
  });
});
