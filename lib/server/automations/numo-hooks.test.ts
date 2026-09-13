import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NumoTurn } from "@/lib/server/numo/turns";

vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (work: () => Promise<void>) => void work(),
}));
vi.mock("./chain", () => ({
  getChain: vi.fn(async () => ({
    id: "chain-1",
    issue_id: "issue-1",
    project_id: "project-1",
  })),
  recomputeChainSpend: vi.fn(async () => 0.5),
  numoAutomationOperationForTurn: vi.fn(async () => ({ outcome: "ok" })),
}));
vi.mock("./engine", () => ({ scheduleAutomations: vi.fn() }));
vi.mock("./report", () => ({ haltChain: vi.fn(async () => undefined) }));

const { notifyAutomationOfNumoTurn } = await import("./numo-hooks");
const chain = await import("./chain");
const engine = await import("./engine");
const report = await import("./report");

function turn(status: NumoTurn["status"]): NumoTurn {
  return {
    id: "turn-1",
    conversation_id: "conversation-1",
    user_id: "owner-1",
    request_id: "request-1",
    run_id: "usage-1",
    status,
    intent: {
      projectId: "project-1",
      locale: "en",
      timezone: "",
      numoDefaultStatus: "triage",
      webSearchEnabled: false,
      automation: {
        chainId: "chain-1",
        step: 2,
        ruleId: "rule-2",
        preset: "loop-by-effort",
        retries: 0,
        mode: "implement",
        issue: {
          id: "issue-1",
          identifier: "MIN-42",
          title: "Ship it",
          plan: "- [ ] Implement it",
        },
      },
    },
    checkpoint: { phase: "done" },
    model: "assistant-model",
    reasoning_level: "medium",
    active_run_id: null,
    claim_token: null,
    claimed_at: null,
    attempts: 1,
    last_event_seq: 0,
    cost_usd: 0.5,
    outcome: "Done",
    error_message: null,
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
  };
}

async function settle() {
  await vi.waitFor(() => expect(chain.recomputeChainSpend).toHaveBeenCalled());
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => vi.clearAllMocks());

describe("automation-owned Numo turn completion", () => {
  it("advances only after the parent Numo turn completes", async () => {
    notifyAutomationOfNumoTurn(turn("waiting_work"));
    await settle();
    expect(engine.scheduleAutomations).not.toHaveBeenCalled();

    vi.clearAllMocks();
    notifyAutomationOfNumoTurn(turn("completed"));
    await settle();
    expect(engine.scheduleAutomations).toHaveBeenCalledWith({
      issueId: "issue-1",
      projectId: "project-1",
      chainId: "chain-1",
      event: { type: "run_finished", intent: "implement", outcome: "ok" },
    });
  });

  it("uses Numo's recorded interpretation instead of turn completion alone", async () => {
    vi.mocked(chain.numoAutomationOperationForTurn).mockResolvedValueOnce({
      outcome: "failed",
    } as never);
    notifyAutomationOfNumoTurn(turn("completed"));
    await settle();
    expect(engine.scheduleAutomations).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { type: "run_finished", intent: "implement", outcome: "failed" },
      }),
    );
  });

  it("stops when a completed turn omitted its machine-readable outcome", async () => {
    vi.mocked(chain.numoAutomationOperationForTurn).mockResolvedValueOnce(null);
    notifyAutomationOfNumoTurn(turn("completed"));
    await settle();
    expect(report.haltChain).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chain-1" }),
      "numo_outcome_missing",
    );
    expect(engine.scheduleAutomations).not.toHaveBeenCalled();
  });

  it("keeps worker and user input suspensions on the current step", async () => {
    for (const status of ["waiting_work", "waiting_input"] as const) {
      notifyAutomationOfNumoTurn(turn(status));
      await settle();
      expect(engine.scheduleAutomations).not.toHaveBeenCalled();
      expect(report.haltChain).not.toHaveBeenCalled();
      vi.clearAllMocks();
    }
  });

  it("stops the chain on a terminal Numo failure", async () => {
    notifyAutomationOfNumoTurn(turn("failed"));
    await settle();
    expect(report.haltChain).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chain-1" }),
      "numo_failed",
    );
    expect(engine.scheduleAutomations).not.toHaveBeenCalled();
  });

  it("records an explicit Numo stop as an interruption", async () => {
    notifyAutomationOfNumoTurn(turn("stopped"));
    await settle();
    expect(report.haltChain).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chain-1" }),
      "interrupted",
    );
    expect(engine.scheduleAutomations).not.toHaveBeenCalled();
  });
});
