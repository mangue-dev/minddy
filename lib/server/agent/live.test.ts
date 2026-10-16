import { afterEach, describe, expect, it, vi } from "vitest";

const { broadcastToTopic } = await import("./live");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("private Realtime invalidation transport", () => {
  it("skips the broadcast when the service endpoint is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    await broadcastToTopic("pull-request:pr-id", "changed", { parts: ["checks"] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the invalidation through the private broadcast RPC", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");

    await broadcastToTopic("pull-request:pr-id", "changed", { parts: ["checks"] });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://supabase.example.test/rest/v1/rpc/broadcast_private_realtime");
    expect(JSON.parse(String(request.body))).toEqual({
      p_topic: "pull-request:pr-id", p_event: "changed",
      p_payload: { parts: ["checks"] },
    });
  });

  it("swallows transport failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");

    await expect(
      broadcastToTopic("pull-request:pr-id", "changed", {}),
    ).resolves.toBeUndefined();
  });
});
