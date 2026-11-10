import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, NumoCompactionContext, ProcessChatContext } from "./loop";

const h = vi.hoisted(() => ({ fetchModel: vi.fn(), modelInfo: vi.fn(), executeTool: vi.fn() }));
vi.mock("./execute-tool", () => ({ executeTool: h.executeTool }));
vi.mock("@/lib/server/ai-runtime", () => ({ fetchAiChat: h.fetchModel }));
vi.mock("@/lib/server/app-config", () => ({ getAppConfigValues: async () => ({}) }));
vi.mock("@/lib/server/agent/openrouter-index", () => ({
  getOpenRouterModelInfo: h.modelInfo,
  getCachedOpenRouterModelInfo: vi.fn(() => null),
  loadOpenRouterIndex: vi.fn(),
}));

const {
  NUMO_COMPACT_BUDGET_TOKENS,
  NUMO_COMPACT_FALLBACK_TOKENS,
  NUMO_COMPACT_MIN_TOKENS,
  compactionTranscript,
  estimatePromptTokens,
  numoCompactThreshold,
  numoContextWindow,
  planCompaction,
  withContextSummary,
} = await import("./context-compaction");
const { processChat } = await import("./loop");

const system: ChatMessage = { role: "system", content: "You are Numo." };

/** One user request, the tool call it caused and a large result. */
function exchange(index: number, resultChars = 8_000): ChatMessage[] {
  return [
    { role: "user", content: `Request ${index}: ${"u".repeat(800)}` },
    { role: "assistant", content: null, tool_calls: [{
      id: `call-${index}`, type: "function", function: { name: "list_issues", arguments: `{"page":${index}}` },
    }] },
    { role: "tool", tool_call_id: `call-${index}`, content: `Result ${index}: ${"r".repeat(resultChars)}` },
    { role: "assistant", content: `Answer ${index}.` },
  ];
}

describe("compaction threshold (MIN-954)", () => {
  it("follows the model's window below the cost ceiling", () => {
    expect(numoCompactThreshold(64_000)).toBe(48_000);
    expect(numoCompactThreshold(100_000)).toBe(75_000);
  });
  it("stays under the price tier of a very large window", () => {
    expect(numoCompactThreshold(1_000_000)).toBe(NUMO_COMPACT_BUDGET_TOKENS);
    expect(NUMO_COMPACT_BUDGET_TOKENS).toBeLessThan(100_000);
  });
  it("uses a floor for a tiny window and a fallback for an unknown model", () => {
    expect(numoCompactThreshold(8_000)).toBe(NUMO_COMPACT_MIN_TOKENS);
    expect(numoCompactThreshold(null)).toBe(NUMO_COMPACT_FALLBACK_TOKENS);
    expect(numoCompactThreshold(0)).toBe(NUMO_COMPACT_FALLBACK_TOKENS);
  });
  it("reads the window from the OpenRouter index", async () => {
    h.modelInfo.mockResolvedValueOnce({ contextLength: 200_000 });
    await expect(numoContextWindow({ provider: "openrouter", apiKey: "key" }, "anthropic/claude-haiku-5.5"))
      .resolves.toBe(200_000);
    expect(h.modelInfo).toHaveBeenCalledWith("anthropic/claude-haiku-5.5", "key");
    // A native provider's id is looked up under its OpenRouter name.
    h.modelInfo.mockResolvedValueOnce(null);
    await expect(numoContextWindow({ provider: "anthropic", apiKey: "key" }, "claude-haiku-5-5")).resolves.toBeNull();
    expect(h.modelInfo).toHaveBeenLastCalledWith("anthropic/claude-haiku-5-5");
  });
});

describe("compaction plan", () => {
  it("counts tool definitions and fixed sizes for images", () => {
    const tools = [{ type: "function" as const, function: { name: "t", description: "d".repeat(400), parameters: { type: "object" as const, properties: {} } } }];
    const image: ChatMessage = { role: "user", content: [{ type: "image_url", image_url: { url: "data:x" } }] };
    expect(estimatePromptTokens([system], tools)).toBeGreaterThan(estimatePromptTokens([system]) + 100);
    expect(estimatePromptTokens([image])).toBeGreaterThanOrEqual(1_000);
  });

  it("keeps the latest exchange verbatim and never separates a result from its call", () => {
    const messages = [system, ...Array.from({ length: 8 }, (_, i) => exchange(i)).flat()];
    const plan = planCompaction(messages, 16_000)!;
    expect(plan.tail[0]!.role).not.toBe("tool");
    expect(plan.tail.at(-1)).toBe(messages.at(-1));
    expect(plan.summarized[0]).toBe(messages[1]);
    expect(plan.summarized.length + plan.tail.length).toBe(messages.length - 1);
    expect(estimatePromptTokens(plan.tail)).toBeLessThanOrEqual(4_000 + 3_000);
  });

  it("sends the latest user message verbatim when its own turn is compacted", () => {
    const request: ChatMessage = { role: "user", content: "Audit every project." };
    const rounds = Array.from({ length: 6 }, (_, i) => exchange(i).slice(1, 3)).flat();
    const plan = planCompaction([system, ...exchange(9), request, ...rounds], 16_000)!;
    expect(plan.lastUser).toBe(request);
    expect(plan.summarized).toContain(request);
    expect(plan.tail).not.toContain(request);
  });

  it("does not compact when little would be summarized", () => {
    expect(planCompaction([system, ...exchange(1, 100)], 64_000)).toBeNull();
    expect(planCompaction([{ role: "user", content: "no system" }], 1_000)).toBeNull();
  });

  it("gives the summarizer the previous summary first and names each result's tool", () => {
    const transcript = compactionTranscript("Earlier: MIN-42 was created.", exchange(3, 10_000));
    expect(transcript.startsWith("[Summary of what came before]\nEarlier: MIN-42 was created.")).toBe(true);
    expect(transcript).toContain("[Numo called list_issues]");
    expect(transcript).toContain("[Result of list_issues]");
    expect(transcript.length).toBeLessThan(10_000);
  });

  it("appends the summary after the cached system prompt", () => {
    expect(withContextSummary(system, null)).toBe(system);
    expect(withContextSummary(system, "Notes.").content).toContain("You are Numo.");
    const cached: ChatMessage = { role: "system", content: [{ type: "text", text: "Cached.", cache_control: { type: "ephemeral" } }] };
    const content = withContextSummary(cached, "Notes.").content as Array<{ text: string }>;
    expect(content[0]!.text).toBe("Cached.");
    expect(content[1]!.text).toContain("Notes.");
  });
});

function streamed(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: "generation", model: "model",
        choices: [{ delta: { content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }));
}

function summaryResponse(summary: string | null): Response {
  return Response.json({ id: "summary-generation", model: "deepseek/deepseek-v4-flash",
    choices: [{ message: { content: summary } }],
    usage: { prompt_tokens: 20_000, completion_tokens: 400, cost: 0.003 } });
}

describe("compaction in the Numo loop", () => {
  let inserts: Array<Array<Record<string, unknown>>>;
  let client: SupabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    inserts = [];
    client = { from: (table: string) => table === "numo_tool_content_scope" ? {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    } : {
      insert: async (rows: Array<Record<string, unknown>>) => { inserts.push(rows); return { error: null }; },
    } } as unknown as SupabaseClient;
    h.modelInfo.mockResolvedValue({ contextLength: 20_000 });
  });

  function setup(history: ChatMessage[], summary: string | null = "Summary: the user audits issues; MIN-42 exists.") {
    const origins = new WeakMap<ChatMessage, { id: string; createdAt: string }>();
    history.forEach((message, index) => origins.set(message, { id: `row-${index}`, createdAt: `2026-11-10T00:00:${String(index).padStart(2, "0")}Z` }));
    const compaction: NumoCompactionContext = {
      summary: null,
      originOf: (message) => origins.get(message),
      persist: vi.fn(async () => {}),
      recordUsage: vi.fn(async () => {}),
    };
    const ctx: ProcessChatContext = { model: "model", conversationId: "conversation", projectId: null,
      userId: "user", locale: "en", supabase: client, service: client,
      persistCheckpoint: vi.fn(), onGeneration: vi.fn(), beforeGeneration: vi.fn(), compaction };
    h.fetchModel.mockImplementation(async (_runtime: unknown, model: string, requestFor: (m: string) => { stream?: boolean }) =>
      ({ model, response: requestFor(model).stream ? streamed("Done.") : summaryResponse(summary) }));
    return { ctx, compaction, emitter: { emit: vi.fn() } };
  }

  it("summarizes the start, keeps the latest request, and stores the step and the summary", async () => {
    const history = Array.from({ length: 10 }, (_, i) => exchange(i)).flat();
    const request: ChatMessage = { role: "user", content: "And now the last request." };
    const messages = [system, ...history, request];
    const { ctx, compaction, emitter } = setup([...history, request]);

    const result = await processChat(messages, [], emitter as never, ctx);
    expect(result.fullContent).toBe("Done.");

    // One summary call, on the instance's small model, then the turn's call.
    expect(h.fetchModel).toHaveBeenCalledTimes(2);
    expect(h.fetchModel.mock.calls[0]![1]).toBe("deepseek/deepseek-v4-flash");
    const sent = h.fetchModel.mock.calls[1]![2]("model").messages as ChatMessage[];
    expect(sent[0]!.content).toContain("Summary: the user audits issues; MIN-42 exists.");
    expect(sent.at(-1)!.content).toBe("And now the last request.");
    expect(estimatePromptTokens(sent)).toBeLessThan(estimatePromptTokens([system, ...history, request]) / 2);

    expect(compaction.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      generationId: "summary-generation", promptTokens: 20_000, cost: 0.003,
    }), 1);
    // The boundary is the last stored message the summary read.
    const persisted = vi.mocked(compaction.persist).mock.calls[0]![0];
    expect(persisted.summary).toContain("MIN-42");
    const covered = history.findIndex((message) => message === sent[1]) - 1;
    expect(persisted.through).toEqual({ id: `row-${covered}`, createdAt: expect.any(String) });

    // The step: running, then complete, stored as a call and its result.
    const events = emitter.emit.mock.calls.map(([event, data]) => [event, (data as { name?: string }).name]);
    expect(events.slice(0, 4)).toEqual([
      ["tool_call_start", "compact_context"],
      ["tool_call_complete", "compact_context"],
      ["message_complete", undefined],
      ["tool_result", "compact_context"],
    ]);
    expect(inserts[0]).toEqual([
      expect.objectContaining({ role: "assistant", metadata: { context_compaction: true } }),
      expect.objectContaining({ role: "tool", tool_name: "compact_context",
        metadata: { success: true, context_compaction: true } }),
    ]);
  });

  it("starts from the stored summary and leaves a small history alone", async () => {
    const { ctx, emitter } = setup([]);
    ctx.compaction!.summary = "Stored notes.";
    await processChat([system, { role: "user", content: "Hello" }], [], emitter as never, ctx);
    expect(h.fetchModel).toHaveBeenCalledTimes(1);
    const sent = h.fetchModel.mock.calls[0]![2]("model").messages as ChatMessage[];
    expect(sent[0]!.content).toContain("Stored notes.");
    expect(emitter.emit).not.toHaveBeenCalledWith("tool_call_start", expect.anything());
  });

  it("goes on uncompacted when the summary fails", async () => {
    const history = Array.from({ length: 10 }, (_, i) => exchange(i)).flat();
    const { ctx, compaction, emitter } = setup(history, null);
    const result = await processChat([system, ...history, { role: "user", content: "Next." }], [], emitter as never, ctx);
    expect(result.fullContent).toBe("Done.");
    expect(compaction.persist).not.toHaveBeenCalled();
    expect(emitter.emit).toHaveBeenCalledWith("tool_result", expect.objectContaining({ name: "compact_context", success: false }));
    const sent = h.fetchModel.mock.calls[1]![2]("model").messages as ChatMessage[];
    expect(sent).toHaveLength(history.length + 2);
  });

  it("compacts at most once before a model call", async () => {
    const history = Array.from({ length: 10 }, (_, i) => exchange(i, 30_000)).flat();
    const { ctx, emitter } = setup(history);
    await processChat([system, ...history, { role: "user", content: "Next." }], [], emitter as never, ctx);
    const starts = emitter.emit.mock.calls.filter(([event]) => event === "tool_call_start");
    expect(starts).toHaveLength(1);
  });
});
