import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  turn: null as Record<string, unknown> | null,
  events: [] as Array<Record<string, unknown>>,
  checkpoints: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  queuedTurns: [] as Array<Record<string, unknown>>,
  claims: [] as Array<Record<string, unknown>>,
  terminalWorkers: [] as Array<Record<string, unknown>>,
  interruptions: [] as string[],
  failActivity: false,
  managedAi: false,
  operationSpent: 0,
  userUsage: {
    usedUsd: 0,
    period: { start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" },
    billing: { plan: { id: "free", includedUsageUsd: 1 } },
  },
  processChat: vi.fn(),
  recordAiUsage: vi.fn(),
  finalizeAgentDelegationResult: vi.fn(),
}));

function queryFor(table: string) {
  let inserted: Record<string, unknown> | null = null;
  let updated: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query,
    update: (row: Record<string, unknown>) => {
      updated = row;
      return query;
    },
    insert: (row: Record<string, unknown>) => {
      inserted = row;
      if (table === "assistant_messages") h.messages.push(row);
      return query;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      if (table === "agent_runs" && column === "id"
          && updated?.interrupt_requested === true && typeof value === "string") {
        h.interruptions.push(value);
      }
      return query;
    },
    is: () => query,
    not: () => query,
    in: () => query,
    lte: () => query,
    contains: () => query,
    gt: () => query,
    order: () => query,
    limit: () => query,
    single: async () => ({
      data: inserted ? { ...inserted, id: "saved-message" } : h.turn,
      error: null,
    }),
    maybeSingle: async () => ({
      data: table === "numo_assistant_turns" ? h.turn : null,
      error: null,
    }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: table === "assistant_messages"
        ? h.messages
        : table === "numo_assistant_turns"
          ? h.queuedTurns
          : table === "agent_runs"
            ? h.terminalWorkers
            : [],
      error: null,
    }).then(resolve),
  };
  return query;
}

const service = {
  from: (table: string) => queryFor(table),
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    if (name === "claim_numo_turn") {
      h.claims.push(args);
      h.turn = {
        ...h.turn,
        status: "running",
        claim_token: args.p_claim_token,
        attempts: Number(h.turn?.attempts ?? 0) + 1,
      };
      return { data: [h.turn], error: null };
    }
    if (name === "checkpoint_numo_turn") {
      h.checkpoints.push(args);
      h.turn = {
        ...h.turn,
        status: args.p_status,
        checkpoint: args.p_checkpoint,
        active_run_id: args.p_active_run_id,
        error_message: args.p_error_message,
      };
      return { data: [h.turn], error: null };
    }
    if (name === "checkpoint_numo_tool_round") {
      const messageId = "assistant-tool-round";
      const checkpoint = {
        phase: "tools",
        assistantContent: args.p_content,
        assistantReasoning: args.p_reasoning,
        assistantMessageId: messageId,
        pendingToolCalls: args.p_tool_calls,
        completedToolCallIds: [],
        roundCount: args.p_round_count,
      };
      h.messages.push({
        id: messageId,
        turn_id: args.p_turn_id,
        role: "assistant",
        content: args.p_content,
        tool_calls: args.p_tool_calls,
      });
      h.turn = { ...h.turn, checkpoint };
      return { data: [h.turn], error: null };
    }
    if (name === "append_numo_turn_event") {
      if (h.failActivity) return { data: null, error: { message: "journal unavailable" } };
      h.events.push(args);
      return { data: {}, error: null };
    }
    if (name === "recover_stale_numo_turns") return { data: 0, error: null };
    return { data: true, error: null };
  },
} as unknown as SupabaseClient;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/assistant/loop", () => ({
  AmbiguousToolExecutionError: class extends Error {},
  getModelInputModalities: async () => new Set(["text"]),
  modelSupportsCaching: async () => false,
  processChat: (...args: unknown[]) => h.processChat(...args),
}));
vi.mock("@/lib/server/assistant/prompt", () => ({
  buildClockBlock: () => "",
  buildGlobalSystemPrompt: () => "System",
  buildPageContextBlock: () => "Context",
  buildSystemPrompt: () => "Project system",
}));
vi.mock("@/lib/server/assistant/prompt-context", () => ({
  gatherProjectPromptContext: vi.fn(),
}));
vi.mock("@/lib/server/assistant/skills", () => ({
  authorizedSkillsNotes: async (_client: unknown, metadata: unknown[]) => metadata.map(() => ""),
}));
vi.mock("@/lib/server/assistant/attachment-parts", () => ({ buildAttachmentParts: async () => [] }));
vi.mock("@/lib/server/assistant/tools", () => ({
  CONVERSATION_ASSISTANT_TOOLS: [{ function: { name: "get_issue" } }],
  AUTOMATION_ASSISTANT_TOOLS: [
    { function: { name: "get_issue" } },
    { function: { name: "report_automation_outcome" } },
  ],
  AUTOMATION_WORKER_MEDIATION_ASSISTANT_TOOLS: [
    { function: { name: "get_issue" } },
    { function: { name: "report_automation_outcome" } },
    { function: { name: "answer_code_worker" } },
  ],
  WORKER_MEDIATION_ASSISTANT_TOOLS: [
    { function: { name: "ask_user" } },
    { function: { name: "answer_code_worker" } },
  ],
}));
vi.mock("@/lib/server/web-search", () => ({ withoutWebSearch: (tools: unknown) => tools }));
vi.mock("@/lib/server/assistant/commands", () => ({ commandNote: () => "" }));
vi.mock("@/lib/server/assistant/sanitize", () => ({ sanitizeAssistantMessageContent: (value: unknown) => String(value ?? "") }));
vi.mock("@/lib/server/ai-usage", () => ({
  recordAiUsage: (...args: unknown[]) => h.recordAiUsage(...args),
  spentFromNumoOperation: vi.fn(async () => h.operationSpent),
}));
vi.mock("@/lib/server/usage", () => ({
  getUserUsage: vi.fn(async () => h.userUsage),
}));
vi.mock("@/lib/managed-services", () => ({
  isManagedAiEnabled: () => h.managedAi,
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: vi.fn() }));
vi.mock("@/lib/server/ai-runtime", () => ({ resolveAiRuntime: vi.fn() }));
vi.mock("@/lib/server/agent/delegation", () => ({
  finalizeAgentDelegationResult: (...args: unknown[]) => h.finalizeAgentDelegationResult(...args),
}));

const { createDurableNumoEmitter, drainNumoTurns, executeNumoTurn } = await import("./turns");

const runtime = {
  apiKey: "key",
  mode: "platform" as const,
  provider: "generic" as const,
  baseUrl: "http://localhost",
  model: "model",
  requestProfile: {
    usageAccounting: false,
    streamUsage: false,
    outputTokenField: "max_tokens" as const,
    defaultMaxOutputTokens: 4096,
    attribution: false,
    promptCaching: false,
  },
};

function turn(checkpoint: Record<string, unknown> = {}) {
  return {
    id: "51600000-0000-4000-8000-000000000001",
    conversation_id: "51600000-0000-4000-8000-000000000002",
    user_id: "51600000-0000-4000-8000-000000000003",
    request_id: "51600000-0000-4000-8000-000000000004",
    run_id: "51600000-0000-4000-8000-000000000005",
    status: "queued",
    intent: {
      projectId: null,
      locale: "en",
      timezone: "UTC",
      numoDefaultStatus: "triage",
      webSearchEnabled: false,
    },
    checkpoint,
    model: "model",
    reasoning_level: "medium",
    active_run_id: null,
    attempts: 0,
    cost_usd: 0,
  };
}

beforeEach(() => {
  h.turn = turn();
  h.events.length = 0;
  h.checkpoints.length = 0;
  h.messages.length = 0;
  h.queuedTurns.length = 0;
  h.claims.length = 0;
  h.terminalWorkers.length = 0;
  h.interruptions.length = 0;
  h.failActivity = false;
  h.managedAi = false;
  h.operationSpent = 0;
  h.userUsage = {
    usedUsd: 0,
    period: { start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" },
    billing: { plan: { id: "free", includedUsageUsd: 1 } },
  };
  h.messages.push({
    id: "user-message",
    turn_id: h.turn.id,
    role: "user",
    content: "Explain the project",
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {},
    context: null,
  });
  h.processChat.mockReset();
  h.recordAiUsage.mockReset();
  h.finalizeAgentDelegationResult.mockReset();
  h.processChat.mockResolvedValue({
    fullContent: "Done without code.",
    finalReasoning: null,
    allToolCalls: [],
    generations: [],
    suspension: null,
  });
});

describe("durable Numo execution", () => {
  it("uses the model frozen on the admitted turn after a runtime change", async () => {
    h.turn = { ...h.turn!, model: "selected-model" };
    await executeNumoTurn({
      turnId: h.turn.id as string,
      readClient: service,
      aiRuntime: { ...runtime, model: "account-default" },
    });

    expect(h.processChat.mock.calls[0][3]).toMatchObject({
      model: "selected-model",
      aiRuntime: { model: "selected-model" },
    });
  });

  it("finishes a dialogue turn without allocating a code worker", async () => {
    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("completed");
    expect(h.processChat).toHaveBeenCalledOnce();
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "completed",
      p_active_run_id: null,
    });
    expect(h.messages).toContainEqual(expect.objectContaining({
      role: "assistant",
      content: "Done without code.",
    }));
  });

  it("records each parent generation with the durable operation attribution", async () => {
    h.turn = {
      ...h.turn,
      attempts: 1,
      intent: {
        ...(h.turn?.intent as Record<string, unknown>),
        routineId: "routine-1",
        operationBudgetUsd: 1.5,
        operationBudgetPercent: 15,
      },
    };

    await executeNumoTurn({
      turnId: h.turn.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const context = h.processChat.mock.calls[0][3] as {
      onGeneration: (
        generation: Record<string, unknown>,
        round: number,
      ) => Promise<void>;
    };
    await context.onGeneration({
      generationId: "generation-1",
      model: "model",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cost: 0.02,
    }, 2);

    expect(h.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      runId: h.turn.run_id,
      feature: "routine_code",
      billTo: { userId: h.turn.user_id },
      conversationId: h.turn.conversation_id,
      numoTurnId: h.turn.id,
      routineId: "routine-1",
      generationId: "generation-1",
    }));
    expect(context).toMatchObject({
      operationBudgetUsd: 1.5,
      operationBudgetPercent: 15,
      routineId: "routine-1",
    });
  });

  it("finishes with unified account exhaustion details before another generation", async () => {
    h.managedAi = true;
    h.userUsage = {
      usedUsd: 1,
      period: {
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
      },
      billing: { plan: { id: "free", includedUsageUsd: 1 } },
    };
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as { beforeGeneration: () => Promise<void> };
      await context.beforeGeneration();
      throw new Error("unreachable");
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("completed");
    expect(h.messages).toContainEqual(expect.objectContaining({
      role: "assistant",
      content: null,
      metadata: {
        usage_exhausted: expect.objectContaining({
          cause: "account",
          percent: 100,
          resetsAt: "2026-10-01T00:00:00.000Z",
          byok: false,
        }),
      },
    }));
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "completed" });
  });

  it("reports one routine cap across the parent operation on BYOK", async () => {
    h.managedAi = true;
    h.operationSpent = 0.25;
    h.turn = {
      ...h.turn,
      intent: {
        ...(h.turn?.intent as Record<string, unknown>),
        routineId: "routine-1",
        operationBudgetUsd: 0.25,
        operationBudgetPercent: 25,
      },
    };
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as { beforeGeneration: () => Promise<void> };
      await context.beforeGeneration();
      throw new Error("unreachable");
    });

    const result = await executeNumoTurn({
      turnId: h.turn.id as string,
      readClient: service,
      aiRuntime: { ...runtime, mode: "byok" },
    });

    expect(result.status).toBe("completed");
    expect(h.messages).toContainEqual(expect.objectContaining({
      metadata: {
        usage_exhausted: expect.objectContaining({
          cause: "routine_cap",
          percent: 25,
          routineId: "routine-1",
          byok: true,
        }),
      },
    }));
  });

  it("resumes a worker event in the background with code tools disabled", async () => {
    h.turn = turn({
      phase: "worker_result",
      worker_event: {
        type: "worker_completed",
        payload: { status: "completed", outcome: "Tests pass" },
      },
    });
    await executeNumoTurn({ turnId: h.turn.id as string, aiRuntime: runtime });

    expect(h.processChat.mock.calls[0][1]).toEqual([]);
    const prompt = JSON.stringify(h.processChat.mock.calls[0][0]);
    expect(prompt).toContain("worker_completed");
    expect(prompt).toContain('\\"status\\":\\"completed\\"');
    expect(prompt).toContain("Tests pass");
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "completed" });
  });

  it("mediates a durable worker question and preserves its correlation across reloads", async () => {
    const workerRunId = "51600000-0000-4000-8000-000000000006";
    h.turn = {
      ...turn({
        phase: "worker_result",
        worker_event: {
          type: "worker_input",
          payload: {
            result: {
              version: 1,
              status: "needs_input",
              summary: "A source decision is required.",
              changedFiles: [],
              verificationPerformed: [],
              artifacts: [],
              unresolvedDecisions: ["Which API should be used?"],
              inputRequest: {
                parentTurnId: "51600000-0000-4000-8000-000000000001",
                runId: workerRunId,
                questionId: "question-1",
                callId: "call-question",
                questions: [{
                  header: "Source",
                  question: "Which API should be used?",
                  options: [],
                }],
              },
            },
          },
        },
      }),
      active_run_id: workerRunId,
    };
    h.processChat.mockResolvedValue({
      fullContent: "",
      finalReasoning: null,
      allToolCalls: [],
      generations: [],
      suspension: { kind: "input" },
    });

    const result = await executeNumoTurn({
      turnId: h.turn.id as string,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("waiting_input");
    expect(h.processChat.mock.calls[0][1]).toEqual([
      { function: { name: "ask_user" } },
      { function: { name: "answer_code_worker" } },
    ]);
    expect(h.processChat.mock.calls[0][3]).toMatchObject({
      workerInput: {
        parentTurnId: h.turn.id,
        runId: workerRunId,
        questionId: "question-1",
      },
    });
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "waiting_input",
      p_active_run_id: workerRunId,
      p_checkpoint: {
        phase: "worker_input_wait",
        input_request: {
          parentTurnId: h.turn.id,
          runId: workerRunId,
          questionId: "question-1",
        },
      },
    });
  });

  it("keeps automated worker questions inside the chain instead of asking a user", async () => {
    const workerRunId = "51600000-0000-4000-8000-000000000006";
    h.turn = {
      ...turn({
        phase: "worker_result",
        worker_event: {
          type: "worker_input",
          payload: {
            result: {
              version: 1,
              status: "needs_input",
              summary: "A source decision is required.",
              changedFiles: [],
              verificationPerformed: [],
              artifacts: [],
              unresolvedDecisions: ["Which API should be used?"],
              inputRequest: {
                parentTurnId: "51600000-0000-4000-8000-000000000001",
                runId: workerRunId,
                questionId: "question-1",
                callId: "call-question",
                questions: [{
                  header: "Source",
                  question: "Which API should be used?",
                  options: [],
                }],
              },
            },
          },
        },
      }),
      active_run_id: workerRunId,
      intent: {
        ...turn({ phase: "model" }).intent,
        automation: {
          chainId: "chain-1",
          step: 1,
          ruleId: "rule-1",
          preset: "loop-by-effort",
          retries: 0,
          mode: "implement",
          issue: { id: "issue-1", identifier: "MIN-527", title: "Automate", plan: null },
        },
      },
    };
    h.processChat.mockResolvedValue({
      fullContent: "",
      finalReasoning: null,
      allToolCalls: [],
      generations: [],
      suspension: null,
    });

    await executeNumoTurn({ turnId: h.turn.id as string, aiRuntime: runtime });

    expect(h.processChat.mock.calls[0][1]).toEqual([
      { function: { name: "get_issue" } },
      { function: { name: "report_automation_outcome" } },
      { function: { name: "answer_code_worker" } },
    ]);
  });

  it("moves interrupted initial work to retryable instead of leaving it running", async () => {
    h.turn = turn({ phase: "model" });
    const result = await executeNumoTurn({ turnId: h.turn.id as string, aiRuntime: runtime });

    expect(result.status).toBe("retryable");
    expect(h.processChat).not.toHaveBeenCalled();
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "retryable" });
  });

  it("recovers a queued turn whose request died before dispatch", async () => {
    h.queuedTurns.push({ id: h.turn!.id, checkpoint: {} });

    await expect(drainNumoTurns({ limit: 1 })).resolves.toEqual({ claimed: 1 });
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "retryable" });
  });

  it("resumes a retryable turn stranded by a dead background dispatch", async () => {
    // A server-started turn (PR review, routine) whose process died leaves
    // nobody around to press "Retry": the drain must pick it up itself.
    h.queuedTurns.push({ id: h.turn!.id, checkpoint: {}, status: "retryable" });

    await expect(drainNumoTurns({ limit: 1 })).resolves.toEqual({ claimed: 1 });
    expect(h.claims.at(-1)).toMatchObject({ p_allow_retryable: true });
  });

  it("finalizes terminal worker handoffs before recovering stale parent turns", async () => {
    h.terminalWorkers.push({
      id: "51600000-0000-4000-8000-000000000006",
      status: "completed",
      parent_numo_turn_id: h.turn!.id,
      delegation_result: null,
    });

    await drainNumoTurns({ limit: 1 });

    expect(h.finalizeAgentDelegationResult).toHaveBeenCalledWith(
      service,
      h.terminalWorkers[0],
    );
  });

  it("preserves the latest tool checkpoint when execution fails", async () => {
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as {
        persistCheckpoint: (checkpoint: Record<string, unknown>) => Promise<void>;
      };
      await context.persistCheckpoint({ phase: "tools", completedToolCallIds: ["call-1"] });
      throw new Error("provider disconnected");
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("retryable");
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "retryable",
      p_checkpoint: { phase: "tools", completedToolCallIds: ["call-1"] },
    });
  });

  it("persists the assistant tool round through the atomic checkpoint RPC", async () => {
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as {
        persistToolRound: (input: Record<string, unknown>) => Promise<string>;
      };
      const messageId = await context.persistToolRound({
        assistantContent: "I will inspect it.",
        assistantReasoning: null,
        pendingToolCalls: [{
          id: "call-1",
          type: "function",
          function: { name: "get_issue", arguments: "{}" },
        }],
        roundCount: 1,
      });
      expect(messageId).toBe("assistant-tool-round");
      throw new Error("process interrupted after checkpoint");
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("retryable");
    expect(h.messages).toContainEqual(expect.objectContaining({
      id: "assistant-tool-round",
      tool_calls: [expect.objectContaining({ id: "call-1" })],
    }));
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "retryable",
      p_checkpoint: expect.objectContaining({
        phase: "tools",
        assistantMessageId: "assistant-tool-round",
      }),
    });
  });

  it("interrupts a worker launched concurrently with a stop request", async () => {
    h.processChat.mockImplementation(async () => {
      h.turn = {
        ...h.turn,
        status: "stopping",
        active_run_id: "51600000-0000-4000-8000-000000000099",
      };
      return {
        fullContent: "",
        finalReasoning: null,
        allToolCalls: [],
        generations: [],
        suspension: {
          kind: "work" as const,
          runId: "51600000-0000-4000-8000-000000000099",
        },
      };
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("stopped");
    expect(h.interruptions).toEqual(["51600000-0000-4000-8000-000000000099"]);
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "stopped",
      p_active_run_id: "51600000-0000-4000-8000-000000000099",
    });
  });

  it("keeps prior tool rounds while reconstructing only the pending batch", async () => {
    h.turn = turn({
      phase: "tools",
      assistantMessageId: "assistant-pending",
      pendingToolCalls: [{
        id: "call-pending",
        type: "function",
        function: { name: "get_issue", arguments: "{}" },
      }],
      completedToolCallIds: [],
      roundCount: 2,
    });
    h.messages.length = 0;
    h.messages.push(
      {
        id: "user-message",
        turn_id: h.turn!.id,
        role: "user",
        content: "Inspect both rounds",
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
      {
        id: "assistant-prior",
        turn_id: h.turn!.id,
        role: "assistant",
        content: "Prior narration",
        tool_calls: [{
          id: "call-prior",
          type: "function",
          function: { name: "get_issue", arguments: "{}" },
        }],
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
      {
        id: "tool-prior",
        turn_id: h.turn.id,
        role: "tool",
        content: "Prior result",
        tool_calls: null,
        tool_call_id: "call-prior",
        tool_name: "get_issue",
        metadata: {},
        context: null,
      },
      {
        id: "assistant-pending",
        turn_id: h.turn.id,
        role: "assistant",
        content: "Pending narration",
        tool_calls: [{
          id: "call-pending",
          type: "function",
          function: { name: "get_issue", arguments: "{}" },
        }],
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
    );

    await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const executionMessages = JSON.stringify(h.processChat.mock.calls[0][0]);
    expect(executionMessages).toContain("Prior narration");
    expect(executionMessages).toContain("Prior result");
    expect(executionMessages).not.toContain("Pending narration");
  });

  it("drops leading tool results when the bounded history cuts through a batch", async () => {
    h.messages.length = 0;
    h.messages.push(
      {
        id: "user-message",
        turn_id: h.turn!.id,
        role: "user",
        content: "Continue with valid history",
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
      {
        id: "orphaned-window-tool",
        turn_id: "older-turn",
        role: "tool",
        content: "Result whose assistant call fell outside the window",
        tool_calls: null,
        tool_call_id: "older-call",
        tool_name: "get_issue",
        metadata: {},
        context: null,
      },
    );

    await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const executionMessages = h.processChat.mock.calls[0][0] as Array<{ role: string }>;
    expect(executionMessages.map((message) => message.role)).toEqual(["system", "user"]);
  });

  it("journals replayable activity but never persists a live-only tool secret", async () => {
    const live = { emit: vi.fn(), close: vi.fn(), isClosed: false };
    const emitter = createDurableNumoEmitter(service, h.turn!.id as string, live);
    emitter.emit("content_delta", { delta: "Hello " });
    emitter.emit("content_delta", { delta: "world" });
    emitter.emit("tool_result", { result: { key: "secret" } });
    emitter.emit("done", { status: "completed" });
    await emitter.flush();

    expect(h.events.map((event) => event.p_type)).toEqual(["content_delta", "done"]);
    expect(JSON.stringify(h.events)).not.toContain("secret");
    expect(live.emit).toHaveBeenCalledTimes(4);
  });

  it("batches streamed reasoning snapshots and always re-states the final trace", async () => {
    const live = { emit: vi.fn(), close: vi.fn(), isClosed: false };
    const emitter = createDurableNumoEmitter(service, h.turn!.id as string, live);
    emitter.emit("reasoning_start", { started_at: "2026-09-05T12:00:00.000Z" });
    emitter.emit("reasoning_delta", { text: "First" });
    emitter.emit("reasoning_delta", { text: "First, second" });
    emitter.emit("reasoning_end", { duration_ms: 900, text: "First, second, third" });
    await emitter.flush();

    // Only the LATEST snapshot is journaled, before the end event that
    // re-states the whole trace — a replay ends on the authoritative text.
    expect(h.events.map((event) => event.p_type)).toEqual([
      "reasoning_start",
      "reasoning_delta",
      "reasoning_end",
    ]);
    const delta = h.events.find((event) => event.p_type === "reasoning_delta");
    expect(delta?.p_payload).toEqual({ text: "First, second" });
    // The live feed forwards every snapshot untouched.
    expect(live.emit).toHaveBeenCalledWith("reasoning_delta", { text: "First" });
    expect(live.emit).toHaveBeenCalledWith("reasoning_delta", { text: "First, second" });
  });

  it("does not strand turn execution when the activity projection is unavailable", async () => {
    h.failActivity = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("completed");
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "completed" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
