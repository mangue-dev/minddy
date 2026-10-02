import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessChatCheckpoint, ProcessChatContext } from "./loop";

const h = vi.hoisted(() => ({ fetchModel: vi.fn(), executeTool: vi.fn() }));
vi.mock("./execute-tool", () => ({ executeTool: h.executeTool }));
vi.mock("@/lib/server/ai-runtime", () => ({ fetchAiChat: h.fetchModel }));

const { processChat, NumoCompletionError } = await import("./loop");

// This French fixture reproduces the malformed tool protocol in the production i18n incident.
const INCIDENT_TEXT = 'Je relance la correction.<tool_call>launch_code_agent<arg_key>objective</arg_key><arg_value>Corriger les traductions</arg_value></tool_call>';
const TOOL = {
  type: "function" as const,
  function: { name: "launch_code_agent", description: "Launch a worker",
    parameters: { type: "object" as const, properties: { objective: { type: "string" } } } },
};
const CALL = { index: 0, id: "native-launch", function: {
  name: "launch_code_agent", arguments: '{"objective":"Correct translations"}',
} };

function response(parts: Array<Record<string, unknown>>, done = true): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      parts.forEach((choice) => controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ id: "generation", model: "model", choices: [choice],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 } })}\n\n`,
      )));
      if (done) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }));
}

function textResponse(text: string): Response {
  return response([{ delta: { content: text }, finish_reason: "stop" }]);
}

function service(): SupabaseClient {
  return { from: (table: string) => table === "numo_tool_content_scope" ? {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  } : {
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "tool-result" }, error: null }) }) }),
  } } as unknown as SupabaseClient;
}

function context(overrides: Partial<ProcessChatContext> = {}): ProcessChatContext {
  const client = service();
  return { model: "model", conversationId: "conversation", projectId: "project",
    userId: "user", locale: "en", supabase: client, service: client,
    persistCheckpoint: vi.fn(), persistToolRound: vi.fn(async () => "tool-round"),
    onGeneration: vi.fn(), beforeGeneration: vi.fn(),
    ...overrides };
}

function run(ctx = context(), emitter = { emit: vi.fn() }) {
  return processChat([{ role: "user", content: "Correct the untranslated strings" }],
    [TOOL], emitter as never, ctx);
}

describe("Numo completion contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    h.executeTool.mockResolvedValue({ success: true, result: { run_id: "worker" } });
  });

  it("repairs split incident XML into one native launch and a durable worker wait", async () => {
    const cut = INCIDENT_TEXT.indexOf("<tool_call") + 5;
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: response([
      { delta: { content: INCIDENT_TEXT.slice(0, cut) } },
      { delta: { content: INCIDENT_TEXT.slice(cut) }, finish_reason: "stop" },
    ]) }).mockResolvedValueOnce({ model: "model", response: response([
      { delta: { tool_calls: [CALL] }, finish_reason: "tool_calls" },
    ]) });
    const ctx = context({ toolLedger: {
      claim: vi.fn(async () => ({ action: "execute" as const })), complete: vi.fn(),
    }, registerActiveRun: vi.fn() });
    const emitter = { emit: vi.fn() };

    const result = await run(ctx, emitter);

    expect(result.fullContent).toBe("");
    expect(result.suspension).toEqual({ kind: "work", runId: "worker" });
    expect(h.executeTool).toHaveBeenCalledTimes(1);
    expect(h.executeTool).toHaveBeenCalledWith("launch_code_agent",
      { objective: "Correct translations" }, expect.any(Object));
    expect(ctx.toolLedger!.complete).toHaveBeenCalledTimes(1);
    expect(ctx.registerActiveRun).toHaveBeenCalledWith("worker");
    expect(ctx.persistToolRound).toHaveBeenCalledWith(expect.objectContaining({
      completionRepairs: 1, pendingToolCalls: [expect.objectContaining({ id: CALL.id })],
    }));
    expect(ctx.persistCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: "tools", completionRepairs: 1, completedToolCallIds: [CALL.id],
    }));
    expect(ctx.onGeneration).toHaveBeenCalledTimes(2);
    expect(ctx.beforeGeneration).toHaveBeenCalledTimes(2);
    const correctionRequest = h.fetchModel.mock.calls[1][2]("model");
    expect(correctionRequest.tools).toEqual([TOOL]);
    expect(JSON.stringify(correctionRequest.messages)).not.toContain("<tool_call");
    const published = emitter.emit.mock.calls.filter(([name]) => name === "content_delta")
      .map(([, payload]) => payload.delta).join("");
    expect(published).not.toContain("<tool_call");
  });

  it("fails repeated serialized calls explicitly without executing their text", async () => {
    h.fetchModel.mockImplementation(async () => ({ model: "model", response: textResponse(INCIDENT_TEXT) }));
    const ctx = context();
    await expect(run(ctx)).rejects.toThrow(NumoCompletionError);
    expect(h.fetchModel).toHaveBeenCalledTimes(3);
    expect(h.executeTool).not.toHaveBeenCalled();
    expect(ctx.onGeneration).toHaveBeenCalledTimes(3);
    expect(ctx.persistCheckpoint).toHaveBeenLastCalledWith({ phase: "model", roundCount: 3,
      completionRepairs: 2, completionRepairPending: false, completionRepairExhausted: true });
  });

  it("does not restart exhausted corrections after a durable retry", async () => {
    const ctx = context({ resumeCheckpoint: { phase: "model", roundCount: 3,
      completionRepairs: 2, completionRepairExhausted: true } });
    await expect(run(ctx)).rejects.toThrow(NumoCompletionError);
    expect(h.fetchModel).not.toHaveBeenCalled();
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it("preserves the repair bound and correction instruction across an interrupted retry", async () => {
    h.fetchModel.mockImplementation(async () => ({ model: "model", response: textResponse(INCIDENT_TEXT) }));
    const ctx = context({ resumeCheckpoint: { phase: "model", roundCount: 1,
      completionRepairs: 1, completionRepairPending: true } });
    await expect(run(ctx)).rejects.toThrow(NumoCompletionError);
    expect(h.fetchModel).toHaveBeenCalledTimes(2);
    expect(h.fetchModel.mock.calls[0][2]("model").messages.some(
      (message: { content?: string }) => message.content?.includes("advertised native tool calls"),
    )).toBe(true);
    expect(ctx.persistCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      completionRepairs: 2, completionRepairExhausted: true,
    }));
  });

  it("repairs a pending action after findings rather than accepting it as a final answer", async () => {
    // The French text is an intentional fixture from the failing worker's final reply.
    const incident = 'La ligne 37 : « Objectives » non traduit en allemand. Je génère les diffs de avec contexte de namespace.';
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: textResponse(incident) })
      .mockResolvedValueOnce({ model: "model", response: textResponse("Three translations were corrected and verified.") });
    const result = await run();
    expect(h.fetchModel).toHaveBeenCalledTimes(2);
    expect(result.fullContent).toBe("Three translations were corrected and verified.");
  });

  it.each([
    ["empty", () => response([{ delta: {}, finish_reason: "stop" }])],
    ["truncated", () => response([{ delta: { content: "The translation" }, finish_reason: "length" }])],
    ["native truncated", () => response([{ delta: { tool_calls: [CALL] }, finish_reason: "max_tokens" }])],
    ["clean EOF", () => response([{ delta: { content: "Partial response" } }], false)],
    ["pending action", () => textResponse("I will launch the correction now.")],
  ])("rejects repeated %s completions after bounded corrections", async (_name, build) => {
    h.fetchModel.mockImplementation(async () => ({ model: "model", response: build() }));
    await expect(run()).rejects.toThrow(NumoCompletionError);
    expect(h.fetchModel).toHaveBeenCalledTimes(3);
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it("accepts a DONE terminal without a finish field for compatible providers", async () => {
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: response([{ delta: { content: "Verified three translations." } }]) });
    const result = await run();
    expect(result.fullContent).toBe("Verified three translations.");
    expect(h.fetchModel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["DONE", `data: ${JSON.stringify({ choices: [{ delta: { content: "Verified three translations." } }] })}\n\ndata: [DONE]`],
    ["compact DONE", `data:${JSON.stringify({ choices: [{ delta: { content: "Verified three translations." } }] })}\n\ndata:[DONE]`],
    ["finish", `data: ${JSON.stringify({ choices: [{ delta: { content: "Verified three translations." }, finish_reason: "stop" }] })}`],
  ])("flushes a final %s SSE line without a trailing newline", async (_name, wire) => {
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: new Response(wire) });
    const result = await run();
    expect(result.fullContent).toBe("Verified three translations.");
    expect(h.fetchModel).toHaveBeenCalledTimes(1);
  });

  it("executes a valid native call in the final SSE line without a trailing newline", async () => {
    const wire = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [CALL] }, finish_reason: "tool_calls" }] })}`;
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: new Response(wire) });
    const result = await run();
    expect(result.suspension).toEqual({ kind: "work", runId: "worker" });
    expect(h.executeTool).toHaveBeenCalledTimes(1);
  });

  it("recognizes a token-limit terminal in a final SSE line without a trailing newline", async () => {
    const wire = `data: ${JSON.stringify({ choices: [{ delta: { content: "Partial answer" }, finish_reason: "length" }] })}`;
    h.fetchModel.mockImplementation(async () => ({ model: "model", response: new Response(wire) }));
    await expect(run()).rejects.toThrow("token limit");
    expect(h.fetchModel).toHaveBeenCalledTimes(3);
  });

  it.each(["unexpected_terminal", "content_filter"])("does not accept finish_reason %s as successful completion", async (finish) => {
    h.fetchModel.mockImplementation(async () => ({ model: "model", response: response([
      { delta: { content: "Partial answer" }, finish_reason: finish },
    ]) }));
    const ctx = context();
    await expect(run(ctx)).rejects.toThrow("successful finish");
    expect(h.fetchModel).toHaveBeenCalledTimes(3);
    expect(ctx.onGeneration).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["non-array delta", { tool_calls: CALL }],
    ["null call", { tool_calls: [null] }],
    ["invalid index", { tool_calls: [{ ...CALL, index: -1 }] }],
    ["non-string ID", { tool_calls: [{ ...CALL, id: 12 }] }],
    ["missing ID", { tool_calls: [{ ...CALL, id: "" }] }],
    ["missing name", { tool_calls: [{ ...CALL, function: { ...CALL.function, name: "" } }] }],
    ["incomplete JSON", { tool_calls: [{ ...CALL, function: { ...CALL.function, arguments: '{"objective":' } }] }],
    ["array arguments", { tool_calls: [{ ...CALL, function: { ...CALL.function, arguments: "[]" } }] }],
    ["non-string arguments", { tool_calls: [{ ...CALL, function: { ...CALL.function, arguments: 12 } }] }],
    ["duplicate IDs", { tool_calls: [CALL, { ...CALL, index: 1 }] }],
  ])("repairs malformed native tool output (%s) without executing it or losing usage", async (_name, delta) => {
    h.fetchModel.mockImplementation(async () => ({ model: "model", response: response([
      { delta, finish_reason: "tool_calls" },
    ]) }));
    const ctx = context();
    await expect(run(ctx)).rejects.toThrow("malformed");
    expect(h.fetchModel).toHaveBeenCalledTimes(3);
    expect(ctx.onGeneration).toHaveBeenCalledTimes(3);
    expect(ctx.persistToolRound).not.toHaveBeenCalled();
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it("does not hide the existing tool cap by running a tools-disabled protocol repair", async () => {
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: textResponse(INCIDENT_TEXT) });
    await expect(run(context({ resumeCheckpoint: { phase: "model", roundCount: 11 } })))
      .rejects.toThrow(NumoCompletionError);
    expect(h.fetchModel).toHaveBeenCalledTimes(1);
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it("observes Stop before a corrective generation", async () => {
    let stopped = false;
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: textResponse(INCIDENT_TEXT) });
    const ctx = context({ shouldStop: async () => stopped,
      persistCheckpoint: vi.fn(async () => { stopped = true; }) });
    const result = await run(ctx);
    expect(h.fetchModel).toHaveBeenCalledTimes(1);
    expect(h.executeTool).not.toHaveBeenCalled();
    expect(result.fullContent).toBe("");
  });

  it("checks the budget again before a corrective generation can call the provider", async () => {
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: textResponse(INCIDENT_TEXT) });
    const ctx = context({ beforeGeneration: vi.fn().mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Operation budget exhausted")) });
    await expect(run(ctx)).rejects.toThrow("Operation budget exhausted");
    expect(h.fetchModel).toHaveBeenCalledTimes(1);
    expect(ctx.onGeneration).toHaveBeenCalledTimes(1);
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it("does not execute unsolicited native calls after the execution round limit", async () => {
    h.fetchModel.mockResolvedValueOnce({ model: "model", response: response([
      { delta: { tool_calls: [CALL] }, finish_reason: "tool_calls" },
    ]) });
    await expect(run(context({ resumeCheckpoint: { phase: "model", roundCount: 12 } })))
      .rejects.toThrow("execution round limit");
    expect(h.fetchModel).toHaveBeenCalledTimes(1);
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it("reuses a durable native tool result without launching twice", async () => {
    const checkpoint: ProcessChatCheckpoint = { phase: "tools", assistantMessageId: "saved-tool-round",
      pendingToolCalls: [{ id: CALL.id, type: "function", function: CALL.function }],
      completedToolCallIds: [], roundCount: 2, completionRepairs: 1 };
    const ctx = context({ resumeCheckpoint: checkpoint, toolLedger: {
      claim: vi.fn(async () => ({ action: "reuse" as const, execution: {
        success: true, result: { run_id: "worker" },
      } })), complete: vi.fn(),
    } });
    const result = await run(ctx);
    expect(result.suspension).toEqual({ kind: "work", runId: "worker" });
    expect(h.fetchModel).not.toHaveBeenCalled();
    expect(h.executeTool).not.toHaveBeenCalled();
  });

  it.each([
    ["round cap", { phase: "tools", roundCount: 13,
      pendingToolCalls: [{ id: CALL.id, type: "function", function: CALL.function }] }],
    ["malformed arguments", { phase: "tools", roundCount: 2,
      pendingToolCalls: [{ id: CALL.id, type: "function", function: { ...CALL.function, arguments: "{" } }] }],
    ["missing tool calls", { phase: "tools", roundCount: 2, pendingToolCalls: [] }],
  ])("does not execute a resumed tool checkpoint that violates the %s contract", async (_name, checkpoint) => {
    const ctx = context({ resumeCheckpoint: checkpoint as ProcessChatCheckpoint });
    await expect(run(ctx)).rejects.toThrow(NumoCompletionError);
    expect(h.fetchModel).not.toHaveBeenCalled();
    expect(h.executeTool).not.toHaveBeenCalled();
    expect(ctx.persistCheckpoint).not.toHaveBeenCalled();
  });
});
