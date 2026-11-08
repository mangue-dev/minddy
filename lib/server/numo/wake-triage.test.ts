import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The triage of a batch through the REAL runner, with both engines mocked:
 * the decision model first, the LLM pass when it fails, and no wake when
 * both fail. The billing and the budget gate are pinned too.
 */

const mocks = vi.hoisted(() => ({
  loadWakeInput: vi.fn(),
  hasUsageBudget: vi.fn(),
  runModelDecision: vi.fn(),
  runLlmDecision: vi.fn(),
  metadata: { numo_background: true } as Record<string, unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: mocks.metadata } }, error: null }) } },
  }),
}));
vi.mock("./wake-context", () => ({ loadWakeInput: mocks.loadWakeInput }));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: mocks.hasUsageBudget }));
vi.mock("@/lib/server/app-config", () => ({ getAppConfigValues: async () => ({}) }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: () => {} }));
vi.mock("@/lib/server/decisions/decision-model", () => ({ runModelDecision: mocks.runModelDecision }));
vi.mock("@/lib/server/decisions/llm", () => ({
  runLlmDecision: mocks.runLlmDecision,
  warmLlmDecision: () => {},
}));
vi.mock("@/lib/server/decisions/shadow", () => ({ runShadowComparison: async () => {} }));

import { triageNumoEventBatch } from "./wake-triage";

const batch = { id: "44444444-4444-4444-8444-444444444444", user_id: "user-1", event_ids: [7, 8] };
const confident = (value: unknown) => ({ value, probability: 0.95, confidence: 0.95 });

function input() {
  return {
    events: [7, 8].map((id) => ({
      id,
      type: "issue.assigned",
      project: "MIN",
      object: { kind: "issue", reference: `MIN-${id}`, title: `Issue ${id}` },
      actor: "Sam Lee",
      relations: id === 7 ? ["assignee"] : [],
      signals: [],
      at: "2026-11-08T10:00:00.000Z",
    })),
    memories: [],
    journal: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadWakeInput.mockResolvedValue(input());
  mocks.hasUsageBudget.mockResolvedValue(true);
  mocks.metadata = { numo_background: true };
});

describe("triageNumoEventBatch", () => {
  it("wakes Numo with the events the decision model kept, billed to the user", async () => {
    mocks.runModelDecision.mockResolvedValue({
      model: "jev-1",
      answers: { wake: confident(true), event_ids: confident(["7"]), reason: confident("concerns_user") },
    });
    const wake = vi.fn(async () => {});
    await expect(triageNumoEventBatch(batch, { wake })).resolves.toBe("woken");
    expect(wake).toHaveBeenCalledWith({
      batchId: batch.id,
      userId: "user-1",
      eventIds: [7],
      reason: "concerns_user",
      sentence: "These events directly concern the user.",
      engine: "model",
    });
    expect(mocks.runModelDecision.mock.calls[0][1]).toMatchObject({ billTo: { userId: "user-1" }, seq: 0 });
    expect(mocks.runLlmDecision).not.toHaveBeenCalled();
    expect(mocks.hasUsageBudget).toHaveBeenCalledWith("user-1", "assistant", "numo_wake_model");
  });

  it("falls back to the LLM on the same run when the model is unavailable", async () => {
    mocks.runModelDecision.mockResolvedValue(null);
    mocks.runLlmDecision.mockResolvedValue({
      wake: { value: false, probability: null, confidence: null },
      event_ids: { value: [], probability: null, confidence: null },
      reason: { value: "none", probability: null, confidence: null },
    });
    const wake = vi.fn(async () => {});
    await expect(triageNumoEventBatch(batch, { wake })).resolves.toBe("asleep");
    expect(wake).not.toHaveBeenCalled();
    const [modelCtx] = mocks.runModelDecision.mock.calls.map((call) => call[1]);
    const [llmCtx] = mocks.runLlmDecision.mock.calls.map((call) => call[1]);
    expect(llmCtx).toMatchObject({ runId: modelCtx.runId, seq: 1 });
  });

  it("does not wake Numo when both engines fail", async () => {
    mocks.runModelDecision.mockResolvedValue(null);
    mocks.runLlmDecision.mockResolvedValue(null);
    const wake = vi.fn(async () => {});
    await expect(triageNumoEventBatch(batch, { wake })).resolves.toBe("no_decision");
    expect(wake).not.toHaveBeenCalled();
  });

  it("spends nothing without budget or without events", async () => {
    mocks.hasUsageBudget.mockResolvedValue(false);
    await expect(triageNumoEventBatch(batch)).resolves.toBe("budget_exhausted");
    mocks.loadWakeInput.mockResolvedValue({ events: [], memories: [], journal: [] });
    await expect(triageNumoEventBatch(batch)).resolves.toBe("empty");
    expect(mocks.runModelDecision).not.toHaveBeenCalled();
    expect(mocks.runLlmDecision).not.toHaveBeenCalled();
  });

  it("closes the batch rather than deciding again when the wake fails", async () => {
    mocks.runModelDecision.mockResolvedValue({
      model: "jev-1",
      answers: { wake: confident(true), event_ids: confident(["7"]), reason: confident("concerns_user") },
    });
    const wake = vi.fn(async () => { throw new Error("wake down"); });
    await expect(triageNumoEventBatch(batch, { wake })).resolves.toBe("wake_failed");
  });

  it("checks the budget of both engines", async () => {
    mocks.hasUsageBudget.mockImplementation(async (_user: string, surface: string) => surface !== "automations");
    await expect(triageNumoEventBatch(batch)).resolves.toBe("budget_exhausted");
    expect(mocks.runModelDecision).not.toHaveBeenCalled();
  });

  it("skips a user who switched background Numo off after routing", async () => {
    mocks.metadata = { numo_background: false };
    await expect(triageNumoEventBatch(batch)).resolves.toBe("switched_off");
    mocks.metadata = { numo_background: "true", numo_memory: false };
    await expect(triageNumoEventBatch(batch)).resolves.toBe("switched_off");
    expect(mocks.loadWakeInput).not.toHaveBeenCalled();
  });

  it("lets a read failure through, so the clock retries the batch", async () => {
    mocks.loadWakeInput.mockRejectedValue(new Error("Unable to read the batch's events for the wake decision"));
    await expect(triageNumoEventBatch(batch)).rejects.toThrow();
  });
});
