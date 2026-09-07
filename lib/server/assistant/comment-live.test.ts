import { afterEach, describe, expect, it, vi } from "vitest";
import { commentDisplay } from "./comment-live";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Numo comment persistence", () => {
  it("writes a completed page reply to the page comment table", async () => {
    const updates: Record<string, unknown>[] = [];
    const from = vi.fn((table: string) => ({
      update(fields: Record<string, unknown>) {
        updates.push(fields);
        return {
          eq: async () => ({ error: null }),
        };
      },
      table,
    }));

    const display = commentDisplay({ from } as never, "comment-id", "page_comments");
    await display.finish("Finished reply");

    expect(from).toHaveBeenCalledWith("page_comments");
    expect(updates).toEqual([
      {
        body: "Finished reply",
        assistant_status: "done",
        assistant_tool: null,
      },
    ]);
  });

  it("sends live text through the generation-aware service RPC", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");
    const service = { from: vi.fn() };

    commentDisplay(service as never, "comment-id").stream("Partial reply");

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://supabase.example.test/rest/v1/rpc/broadcast_private_realtime",
    );
    expect(JSON.parse(String(request.body))).toEqual({
      p_topic: "numo-comment:comment-id",
      p_event: "stream",
      p_payload: {
        text: "Partial reply",
        tool: null,
        at: expect.any(Number),
      },
    });
  });

  it("uses an independent live topic for a page comment with the same id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("MINDDY_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-service-key");

    commentDisplay(
      { from: vi.fn() } as never,
      "comment-id",
      "page_comments",
    ).stream("Page reply");

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      p_topic: "numo-page-comment:comment-id",
      p_event: "stream",
    });
  });
});
