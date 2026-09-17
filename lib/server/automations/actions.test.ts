import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NumoTurn } from "@/lib/server/numo/turns";
import type {
  AgentChain,
  NumoAutomationOperation,
  NumoAutomationOperationState,
} from "./chain";

const h = vi.hoisted(() => ({
  sequence: [] as string[],
  start: vi.fn(),
  execute: vi.fn(),
  bind: vi.fn(),
  notify: vi.fn(),
  ensure: vi.fn(),
  buildPrompt: vi.fn(),
  halt: vi.fn(),
  stop: vi.fn(),
  currentChain: null as AgentChain | null,
}));

const service = {
  auth: {
    admin: {
      getUserById: vi.fn(async () => ({ data: { user: { user_metadata: {} } } })),
    },
  },
};

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/numo/start-intent", () => ({ startNumoIntent: h.start }));
vi.mock("@/lib/server/numo/turns", () => ({
  executeNumoTurn: h.execute,
  requestNumoTurnStop: h.stop,
}));
vi.mock("./numo-hooks", () => ({ notifyAutomationOfNumoTurn: h.notify }));
vi.mock("./chain", () => ({
  bindNumoAutomationOperation: h.bind,
  ensureNumoAutomationOperation: h.ensure,
  getChain: vi.fn(async () => h.currentChain),
  lastNumoAutomationOperation: vi.fn(async () => null),
  lastVerdictOfChain: vi.fn(),
  parkChain: vi.fn(),
}));
vi.mock("@/lib/server/update-issue", () => ({ updateIssueFields: vi.fn() }));
vi.mock("@/lib/server/account-settings", () => ({
  getAccountSettings: vi.fn(async () => ({ ok: true, settings: { locale: "en" } })),
}));
vi.mock("@/lib/server/agent/launch-message", () => ({
  buildAgentLaunchMessage: h.buildPrompt,
}));
vi.mock("./report", () => ({
  haltChain: h.halt,
  notifyChain: vi.fn(),
  postChainComment: vi.fn(),
}));

const { recoverNumoAutomationOperation, runAction } = await import("./actions");

const chain: AgentChain = {
  id: "chain-1",
  project_id: "project-1",
  issue_id: "issue-1",
  owner_id: "owner-1",
  preset: "loop-by-effort",
  status: "running",
  step: 2,
  played_rule_ids: ["rule-1", "rule-2"],
  retries: 0,
  spent_usd: 0,
  budget_usd: null,
  stop_reason: null,
  not_before: null,
  pending_event: null,
  created_at: "2026-09-13T00:00:00Z",
  updated_at: "2026-09-13T00:00:00Z",
};

const operation: NumoAutomationOperation = {
  id: "operation-1",
  chain_id: chain.id,
  step: chain.step,
  rule_id: "rule-2",
  mode: "implement",
  conversation_id: "conversation-1",
  request_id: "request-1",
  turn_id: "turn-1",
  prompt: "Implement the issue.",
  locale: "en",
  context: {
    chainId: chain.id,
    step: chain.step,
    ruleId: "rule-2",
    preset: chain.preset,
    retries: 0,
    mode: "implement",
    issue: {
      id: chain.issue_id,
      identifier: "MIN-42",
      title: "Implement it",
      plan: "- [ ] Make the change",
    },
  },
  outcome: null,
  outcome_summary: null,
  outcome_blockers: [],
  created_at: "2026-09-13T00:00:00Z",
  updated_at: "2026-09-13T00:00:00Z",
};

function turn(status: NumoTurn["status"]): NumoTurn {
  return {
    id: "turn-1",
    conversation_id: operation.conversation_id,
    user_id: chain.owner_id,
    request_id: operation.request_id,
    run_id: "usage-1",
    status,
    intent: {
      projectId: chain.project_id,
      locale: "en",
      timezone: "",
      numoDefaultStatus: "triage",
      webSearchEnabled: false,
      automation: operation.context,
    },
    checkpoint: { phase: "done" },
    model: "assistant-model",
    reasoning_level: "medium",
    active_run_id: null,
    claim_token: null,
    claimed_at: null,
    attempts: 1,
    last_event_seq: 0,
    cost_usd: 0,
    outcome: null,
    error_message: null,
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
  };
}

const state = (status: NumoTurn["status"] | null): NumoAutomationOperationState => ({
  operation: { ...operation, turn_id: status ? "turn-1" : null },
  turn: status ? turn(status) : null,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.currentChain = chain;
  h.sequence.length = 0;
  h.start.mockImplementation(async () => {
    h.sequence.push("start");
    return {
      conversationId: "conversation-1",
      turnId: "turn-1",
    };
  });
  h.bind.mockImplementation(async () => {
    h.sequence.push("bind");
    return { ...operation, turn_id: "turn-1" };
  });
  h.execute.mockImplementation(async () => {
    h.sequence.push("execute");
    return { status: "waiting_work", turn: turn("waiting_work") };
  });
  h.ensure.mockResolvedValue(operation);
  h.buildPrompt.mockResolvedValue("Implement the issue.");
});

describe("Numo automation operation recovery", () => {
  it("submits an automated step through the canonical Numo intent", async () => {
    await expect(runAction({
      chain,
      action: { type: "run_numo", mode: "implement" },
      issue: {
        id: chain.issue_id,
        number: 42,
        title: "Implement it",
        plan: "- [ ] Make the change",
        effort: "m",
        project_key: "MIN",
      },
    })).resolves.toEqual({ kind: "submitted", turnId: "turn-1" });

    expect(h.ensure).toHaveBeenCalledWith(expect.objectContaining({
      chain,
      ruleId: "rule-2",
      mode: "implement",
      prompt: "Implement the issue.",
      context: expect.objectContaining({
        chainId: chain.id,
        step: chain.step,
        ruleId: "rule-2",
        issue: expect.objectContaining({
          id: chain.issue_id,
          identifier: "MIN-42",
          plan: "- [ ] Make the change",
        }),
      }),
    }));
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: operation.conversation_id,
      requestId: operation.request_id,
      automation: operation.context,
    }));
  });

  it("replays admission with the same conversation and request before execution", async () => {
    await recoverNumoAutomationOperation(chain, state(null));
    expect(h.start).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: operation.conversation_id,
      requestId: operation.request_id,
      automation: operation.context,
      context: expect.objectContaining({ issueId: chain.issue_id }),
      executeInBackground: false,
    }));
    expect(h.sequence).toEqual(["start", "bind", "execute"]);
  });

  it("retries the same durable turn without admitting another operation", async () => {
    await recoverNumoAutomationOperation(chain, state("retryable"));
    expect(h.start).not.toHaveBeenCalled();
    expect(h.execute).toHaveBeenCalledWith({
      turnId: "turn-1",
      readClient: service,
      allowRetryable: true,
    });
  });

  it("halts visibly when admission fails before a retryable turn exists", async () => {
    h.start.mockRejectedValueOnce(new Error("usage unavailable"));
    await expect(
      recoverNumoAutomationOperation(chain, state(null)),
    ).rejects.toThrow("usage unavailable");
    expect(h.halt).toHaveBeenCalledWith(chain, "numo_failed");
    expect(h.bind).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
  });

  it("stops a turn admitted after the chain was explicitly stopped", async () => {
    h.currentChain = { ...chain, status: "stopped" };
    await recoverNumoAutomationOperation(chain, state(null));

    expect(h.stop).toHaveBeenCalledWith(operation.conversation_id, chain.owner_id);
    expect(h.execute).not.toHaveBeenCalled();
  });

  it("redelivers a terminal outcome without executing the step again", async () => {
    const completed = state("completed");
    await recoverNumoAutomationOperation(chain, completed);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(completed.turn);
  });
});
