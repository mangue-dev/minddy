import { afterEach, describe, expect, it, vi } from "vitest";

import { broadcastToTopic } from "./live";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("agent live Realtime transport", () => {
  it("sends logical topics through the generation-aware service RPC", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");

    await broadcastToTopic("agent-run:run-id", "stream", { text: "partial" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://supabase.example.test/rest/v1/rpc/broadcast_private_realtime",
    );
    expect(JSON.parse(String(request.body))).toEqual({
      p_topic: "agent-run:run-id",
      p_event: "stream",
      p_payload: { text: "partial" },
    });
  });
});
