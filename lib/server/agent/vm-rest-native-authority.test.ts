import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRun } from "./runs";
import type { VmTurnReport } from "./vm/protocol";

const h = vi.hoisted(() => ({
  stamp: vi.fn(), stampResult: vi.fn(), event: vi.fn(), notify: vi.fn(), usage: vi.fn(),
}));
vi.mock("@/lib/server/usage", () => ({ recordSandboxUsage: h.usage }));
vi.mock("@/lib/server/ai-usage", () => ({
  spentFromLedger: async () => 0, spentForBudget: async () => 0, spentPlatformForBudget: async () => 0,
}));
vi.mock("./quota", () => ({ checkAgentQuota: async () => ({ mode: "subscription", remaining: 0, cap: 10 }) }));
vi.mock("./repo-access", () => ({ resolveRepoCloneTarget: async () => null }));
vi.mock("./forge", () => ({ forgeFor: vi.fn() }));
vi.mock("./run-key", () => ({ revokeRunKey: vi.fn() }));
vi.mock("./pr-landing", () => ({
  notePrCommits: vi.fn(), reopenIfRejectedWorkPushed: vi.fn(),
  resolveRunPrefs: async () => ({ locale: "en" }), prRef: vi.fn(), prTerm: vi.fn(),
  MERGED_DURING_TURN_STRINGS: {}, PUSH_FAILED_STRINGS: {}, SANDBOX_USAGE_SEQ_BASE: 1000,
}));
vi.mock("./runs", () => ({
  appendEvent: h.event, hasPendingRunMessages: async () => false, clearInterrupt: async () => {},
  notifyAgentRun: h.notify, stampRun: h.stamp, stampRunResult: h.stampResult,
}));

const { landVmTurn } = await import("./vm-rest");
const REST = "2026-10-10T12:00:00.000Z";
let run: AgentRun;
function report(overrides: Partial<VmTurnReport> = {}): VmTurnReport {
  return {
    status: "completed", reply: "Fixture finished", costUsd: 0, sandboxMs: 1000,
    checkpoint: { messages: [], native: { engine: "codex", history: [{ role: "user", text: "Fixture" }] } },
    checkpointDropped: [], checkpointBytes: 100, pushed: null, workBranch: "numo/fixture",
    ...overrides,
  };
}
const expectedGuard = () => ({ expected: {
  rest_claimed_at: REST, sandbox_reap_claim: null,
  started_at: run.started_at, sandbox_id: "old-sandbox",
} });

beforeEach(() => {
  vi.resetAllMocks();
  run = {
    id: "run", created_by: "owner", project_id: "project", conversation_id: "conversation",
    agent_engine: "codex", key_mode: "subscription", status: "running",
    rest_claimed_at: REST, started_at: "2026-10-10T11:59:00.000Z", sandbox_id: "old-sandbox",
    sandbox_reap_claim: null, continuations: 0, cost_usd: 0, checkpoint: null,
    provider_key_id: null,
  } as unknown as AgentRun;
  h.stampResult.mockResolvedValue({ run, failed: false });
  h.stamp.mockResolvedValue(run);
  h.event.mockResolvedValue(undefined);
  h.notify.mockResolvedValue(undefined);
  h.usage.mockResolvedValue(undefined);
});

describe("native completion callback authority", () => {
  it.each(["completed", "error", "interrupted", "budget_exhausted"] as const)("fences the %s terminal stamp with the original rest claim", async (status) => {
    await landVmTurn(run, report({ status }));
    expect(h.stampResult).toHaveBeenCalledWith("run", expect.objectContaining({ status: "completed" }), expectedGuard());
  });

  it("rejects a native report without a claimed completion before billing or writes", async () => {
    run.rest_claimed_at = null;
    await expect(landVmTurn(run, report())).rejects.toThrow("Native rest authority unavailable");
    expect(h.usage).not.toHaveBeenCalled();
    expect(h.stampResult).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("rejects a report already marked for watchdog recovery", async () => {
    run.sandbox_reap_claim = "recovery";
    await expect(landVmTurn(run, report())).rejects.toThrow("Native rest authority unavailable");
    expect(h.stampResult).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("does not notify or retry completion when a newer rest claim won takeover", async () => {
    h.stampResult.mockImplementation(async (_id, _fields, options) => {
      const currentRest = "2026-10-10T12:30:00.000Z";
      return { failed: false, run: options.expected.rest_claimed_at === currentRest ? run : null };
    });
    await expect(landVmTurn(run, report())).rejects.toThrow("Native rest authority superseded");
    expect(h.stampResult).toHaveBeenCalledTimes(1);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("preserves the same authority fence on the checkpoint-free retry", async () => {
    h.stampResult.mockResolvedValueOnce({ run: null, failed: true });
    await landVmTurn(run, report());
    expect(h.stampResult).toHaveBeenCalledTimes(2);
    expect(h.stampResult.mock.calls[0][2]).toEqual(expectedGuard());
    expect(h.stampResult.mock.calls[1][2]).toEqual(expectedGuard());
    expect(h.stampResult.mock.calls[1][1]).not.toHaveProperty("checkpoint");
  });

  it("does not publish completion if takeover wins during the checkpoint retry", async () => {
    h.stampResult.mockResolvedValueOnce({ run: null, failed: true });
    h.stampResult.mockResolvedValueOnce({ run: null, failed: false });
    await expect(landVmTurn(run, report())).rejects.toThrow("Native rest authority superseded");
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.event.mock.calls.some((call) => call[2]?.code === "checkpointRefused")).toBe(false);
  });

  it("does not report native completion after both persistence attempts fail", async () => {
    h.stampResult.mockResolvedValue({ run: null, failed: true });
    await expect(landVmTurn(run, report())).rejects.toThrow("Native rest persistence unavailable");
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("fences provider retry requeue with the same completion authority", async () => {
    await landVmTurn(run, report({ status: "error", errorCode: "providerUnavailable" }));
    expect(h.stampResult).toHaveBeenCalledWith("run", expect.objectContaining({ status: "queued" }), expectedGuard());
    expect(h.stamp).not.toHaveBeenCalled();
  });
});
