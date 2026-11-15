import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessChatContext } from "./loop";

const h = vi.hoisted(() => ({ fetchModel: vi.fn(), executeTool: vi.fn(), inserts: [] as Record<string, unknown>[] }));
vi.mock("./execute-tool", () => ({ executeTool: h.executeTool }));
vi.mock("@/lib/server/ai-runtime", () => ({ fetchAiChat: h.fetchModel }));
vi.mock("@/lib/server/agent/openrouter-index", () => ({
  getOpenRouterModelInfo: vi.fn(async () => null),
  getCachedOpenRouterModelInfo: vi.fn(() => null),
  loadOpenRouterIndex: vi.fn(),
}));

const { processChat } = await import("./loop");
const { searchToolsDefinition } = await import("./tool-loading");

/**
 * MIN-1001 — search_tools adds deferred tools to the NEXT request of the same
 * turn, at the end of the list; a tool outside the turn's pool never runs.
 */

const tool = (name: string) => ({
  type: "function" as const,
  function: { name, description: `${name} tool`, parameters: { type: "object" as const, properties: {} } },
});

function stream(choice: Record<string, unknown>): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: "g", model: "model", choices: [choice],
        usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }));
}

const callOf = (name: string, args: Record<string, unknown>) => stream({
  delta: { tool_calls: [{ index: 0, id: `call-${name}`, function: { name, arguments: JSON.stringify(args) } }] },
  finish_reason: "tool_calls",
});

function context(): ProcessChatContext {
  const client = { from: (table: string) => table === "numo_tool_content_scope" ? {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  } : {
    insert: (row: Record<string, unknown>) => {
      h.inserts.push(row);
      return { select: () => ({ single: async () => ({ data: { id: "row" }, error: null }) }) };
    },
  } } as unknown as SupabaseClient;
  return { model: "model", conversationId: "conversation", projectId: "project", userId: "user",
    locale: "en", supabase: client, service: client, persistCheckpoint: vi.fn(),
    persistToolRound: vi.fn(async () => "tool-round"), onGeneration: vi.fn(), beforeGeneration: vi.fn(),
    deferredTools: [tool("create_routine"), tool("update_routine")] };
}

const sentTools = (call: number) =>
  (h.fetchModel.mock.calls[call][2]("model").tools ?? []).map((t: { function: { name: string } }) => t.function.name);

describe("tools loaded on demand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.inserts.length = 0;
    process.env.OPENROUTER_API_KEY = "test-key";
    h.executeTool.mockResolvedValue({ success: true, result: { ok: true } });
  });

  it("sends a loaded tool from the next round on, at the end of the list", async () => {
    h.fetchModel
      .mockResolvedValueOnce({ model: "model", response: callOf("search_tools", { query: "create_routine" }) })
      .mockResolvedValueOnce({ model: "model", response: callOf("create_routine", { prompt: "p" }) })
      .mockResolvedValueOnce({ model: "model", response: stream({ delta: { content: "Done." }, finish_reason: "stop" }) });
    const result = await processChat([{ role: "user", content: "Every Monday, triage." }],
      [tool("create_issue"), searchToolsDefinition()], { emit: vi.fn() } as never, context());
    expect(result.fullContent).toBe("Done.");
    expect(sentTools(0)).toEqual(["create_issue", "search_tools"]);
    expect(sentTools(1)).toEqual(["create_issue", "search_tools", "create_routine"]);
    // search_tools never reaches the executor; the loaded tool does.
    expect(h.executeTool).toHaveBeenCalledTimes(1);
    expect(h.executeTool.mock.calls[0][0]).toBe("create_routine");
    // A later turn reloads it from the stored row.
    expect(h.inserts.find((row) => row.tool_name === "search_tools")?.metadata)
      .toMatchObject({ success: true, loaded: ["create_routine"] });
  });

  it("answers a search for a tool already sent instead of failing", async () => {
    h.fetchModel
      .mockResolvedValueOnce({ model: "model", response: callOf("search_tools", { query: "create_issue" }) })
      .mockResolvedValueOnce({ model: "model", response: stream({ delta: { content: "Done." }, finish_reason: "stop" }) });
    await processChat([{ role: "user", content: "Create an issue." }],
      [tool("create_issue"), searchToolsDefinition()], { emit: vi.fn() } as never, context());
    const row = h.inserts.find((r) => r.tool_name === "search_tools");
    expect(row?.metadata).toMatchObject({ success: true, loaded: [] });
    expect(String(row?.content)).toContain("already_available");
    expect(sentTools(1)).toEqual(["create_issue", "search_tools"]);
  });

  it("refuses a tool outside the turn's pool without running it", async () => {
    h.fetchModel
      .mockResolvedValueOnce({ model: "model", response: callOf("admin_get_costs", {}) })
      .mockResolvedValueOnce({ model: "model", response: stream({ delta: { content: "I can't." }, finish_reason: "stop" }) });
    await processChat([{ role: "user", content: "Costs?" }], [tool("create_issue")], { emit: vi.fn() } as never, context());
    expect(h.executeTool).not.toHaveBeenCalled();
    expect(String(h.inserts.find((row) => row.tool_name === "admin_get_costs")?.content))
      .toContain("not available in this turn");
  });
});
