import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRun } from "@/lib/server/agent/runs";

const h = vi.hoisted(() => ({
  getRun: vi.fn(), quota: vi.fn(), resume: vi.fn(), latest: vi.fn(),
  rpc: vi.fn(), kick: vi.fn(), update: vi.fn(), eq: vi.fn(),
}));
vi.mock("@/lib/server/agent/quota", () => ({ checkAgentQuota: h.quota }));
vi.mock("@/lib/server/agent/runs", () => ({
  getRun: h.getRun, resumeLatestRunWithMessage: h.resume, runIsLatestOnAnchor: h.latest,
}));
vi.mock("@/lib/server/agent/launch", () => ({ kickAgentDrain: h.kick }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: h.rpc,
    from: (table: string) => {
      if (table !== "agent_runs") throw new Error(`Unexpected table: ${table}`);
      return { update: h.update };
    },
  }),
}));
vi.mock("@/lib/server/agent/run-launch-content", () => ({
  shouldEncryptAgentLaunch: async () => false,
}));
vi.mock("@/lib/server/agent/run-queue-content", () => ({ encodeQueueMessage: vi.fn() }));
vi.mock("@/lib/server/agent/run-input-answer-content", () => ({ encodeAgentInputAnswer: vi.fn() }));
vi.mock("@/lib/server/agent/worker-parent-content", () => ({ encodeWorkerParentMessage: vi.fn() }));

const { answerNumoWorkerInput, relaunchNumoWorkerRun } = await import("./worker-mediation");
const OWNER = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const TURN = "44444444-4444-4444-8444-444444444444";
const PERIOD = "2026-10-01T00:00:00.000Z";
let run: AgentRun;
const answerInput = {
  conversationId: CONVERSATION, userId: OWNER,
  correlation: { parentTurnId: TURN, runId: RUN, questionId: "question-1" },
  answer: "  Continue with the existing branch.  ", persistParentMessage: true,
};
const relaunchInput = {
  conversationId: CONVERSATION, userId: OWNER, runId: RUN,
  message: " Recheck the implementation. ", parentTurnId: TURN, parentToolCallId: "tool-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  run = {
    id: RUN, created_by: OWNER, project_id: "fixture-project", status: "completed",
    agent_engine: "codex", key_mode: "subscription", budget_usd: null,
    parent_numo_conversation_id: CONVERSATION, parent_numo_turn_id: TURN,
    native_connection_id: "connection-1", native_connection_generation: 7,
    local_exec: false, awaiting_input: false, pr_state: "open", sandbox_reap_claim: null,
    checkpoint: { messages: [], native: { engine: "codex", history: [
      { role: "user", text: "Implement the fixture" }, { role: "assistant", text: "Branch pushed" },
    ] } },
  } as unknown as AgentRun;
  h.getRun.mockImplementation(async () => run);
  h.latest.mockResolvedValue(true);
  h.quota.mockResolvedValue({ allowed: true, unlimited: false, mode: "subscription", cap: 10, periodStart: PERIOD });
  h.rpc.mockResolvedValue({ data: "queued", error: null });
  h.resume.mockResolvedValue("queued");
  h.eq.mockResolvedValue({ error: null });
  h.update.mockReturnValue({ eq: h.eq });
});

describe("native worker question resume", () => {
  it.each(["codex", "claude_code"] as const)("reserves owner compute for frozen %s without a BYOK exemption", async (engine) => {
    run.agent_engine = engine;
    await expect(answerNumoWorkerInput(answerInput)).resolves.toMatchObject({ action: "answered", runId: RUN });
    expect(h.quota).toHaveBeenCalledExactlyOnceWith(OWNER, "agent", { subscription: true });
    expect(h.rpc).toHaveBeenCalledWith("resume_numo_worker_input", expect.objectContaining({
      p_user_id: OWNER, p_run_id: RUN, p_question_id: "question-1",
      p_answer: "Continue with the existing branch.", p_usage_since: PERIOD,
      p_budget_cap: 10, p_requested_budget: 10,
    }));
    expect(h.kick).toHaveBeenCalledTimes(1);
  });

  it.each([
    { allowed: false, mode: "subscription", cap: 10, periodStart: PERIOD },
    { allowed: true, mode: "byok", unlimited: true },
    { allowed: true, mode: "subscription", cap: 10 },
  ])("refuses an exhausted or unreserved subscription resume (%j)", async (quota) => {
    h.quota.mockResolvedValue(quota);
    await expect(answerNumoWorkerInput(answerInput)).resolves.toEqual({ action: "refused", reason: "quota_exceeded" });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.kick).not.toHaveBeenCalled();
  });

  it("rejects an answer from a different account before budget or database work", async () => {
    await expect(answerNumoWorkerInput({ ...answerInput, userId: "another-user" })).resolves.toEqual({
      action: "refused", reason: "worker_input_mismatch",
    });
    expect(h.quota).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("native worker relaunch", () => {
  it("retains the frozen harness, connection generation and portable history", async () => {
    const frozenCheckpoint = run.checkpoint;
    await expect(relaunchNumoWorkerRun(relaunchInput)).resolves.toEqual({ ok: true, run });
    expect(h.quota).toHaveBeenCalledExactlyOnceWith(OWNER, "agent", { subscription: true });
    expect(h.resume).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: OWNER, actorId: OWNER, runId: RUN, content: "Recheck the implementation.",
      usageSince: PERIOD, budgetCap: 10, requestedBudget: 10,
    }));
    expect(h.update).toHaveBeenCalledExactlyOnceWith({ parent_numo_turn_id: TURN, parent_numo_tool_call_id: "tool-1" });
    expect(run.agent_engine).toBe("codex");
    expect(run.native_connection_generation).toBe(7);
    expect(run.checkpoint).toBe(frozenCheckpoint);
  });

  it("does not relink or drain a worker when atomic compute admission fails", async () => {
    h.resume.mockResolvedValue("no_budget");
    await expect(relaunchNumoWorkerRun(relaunchInput)).resolves.toEqual({ ok: false, code: "quota_exceeded" });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.kick).not.toHaveBeenCalled();
  });

  it("does not interpret a current unlimited API key as native compute admission", async () => {
    h.quota.mockResolvedValue({ allowed: true, unlimited: true, mode: "byok" });
    await expect(relaunchNumoWorkerRun(relaunchInput)).resolves.toEqual({ ok: false, code: "quota_exceeded" });
    expect(h.resume).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("uses a stable resume message ID to avoid duplicate steering on replay", async () => {
    await relaunchNumoWorkerRun(relaunchInput);
    await relaunchNumoWorkerRun(relaunchInput);
    const first = h.resume.mock.calls[0][0];
    const second = h.resume.mock.calls[1][0];
    expect(first.messageId).toMatch(/^[a-f0-9-]{36}$/u);
    expect(second.messageId).toBe(first.messageId);
  });

  it("waits for a fresh physical cleanup claim before requesting another allocation", async () => {
    run.sandbox_reap_claim = "claim-1";
    run.sandbox_reap_claimed_at = new Date().toISOString();
    await expect(relaunchNumoWorkerRun(relaunchInput)).resolves.toEqual({ ok: false, code: "sandbox_reaping" });
    expect(h.resume).not.toHaveBeenCalled();
    expect(h.kick).not.toHaveBeenCalled();
  });
});
