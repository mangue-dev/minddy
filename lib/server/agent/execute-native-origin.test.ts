import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  authority: vi.fn(), stamp: vi.fn(), event: vi.fn(), notify: vi.fn(),
  harness: vi.fn(), lease: vi.fn(), allocate: vi.fn(), reserve: vi.fn(),
  database: vi.fn(), spent: vi.fn(),
}));
vi.mock("./runs", () => ({
  runAuthorityIsCurrent: h.authority, stampRun: h.stamp, appendEvent: h.event,
  notifyAgentRun: h.notify,
}));
vi.mock("./native-worker-selection", () => ({ resolveWorkerHarness: h.harness }));
vi.mock("./native-worker-connections", () => ({
  claimNativeWorkerConnection: h.lease, bindNativeWorkerAllocation: vi.fn(),
  restoreNativeWorkerProfile: vi.fn(), abortNativeWorkerConnection: vi.fn(),
}));
vi.mock("./sandbox-allocation", () => ({
  allocateReservedSandbox: h.allocate, reserveSandboxAllocation: h.reserve,
  cleanupSandboxAllocation: vi.fn(), mintAllocationRunKey: vi.fn(),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: h.database }));
vi.mock("@/lib/server/ai-usage", async (original) => ({
  ...await original<typeof import("@/lib/server/ai-usage")>(), spentFromLedger: h.spent,
}));

import { executeAgentRun } from "./execute";
import type { AgentRun } from "./runs";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  vi.stubEnv("AGENT_CONTROL_ORIGIN", "http://localhost:6463");
  vi.stubEnv("MINDDY_PUBLIC_APP_URL", "https://minddy.app");
  h.authority.mockResolvedValue(true);
  h.spent.mockResolvedValue(0);
  h.database.mockImplementation(() => { throw new Error("Unexpected database access before preflight"); });
});
afterEach(() => vi.unstubAllEnvs());

it.each(["codex", "claude_code"])(
  "fails %s before native credential resolution or sandbox allocation when the hosted origin is invalid",
  async (engine) => {
    const run = { id: "origin-preflight-run", agent_engine: engine, created_by: "owner",
      model: "native-default", routine_id: null, cost_usd: 0, continuations: 0,
      attempts: 0, checkpoint: null, interrupt_requested: false } as AgentRun;
    await expect(executeAgentRun(run, { deadlineMs: Date.now() + 60_000 })).resolves.toBe("failed");
    expect(h.event).toHaveBeenCalledWith(run.id, "error", {
      message: "Hosted agent control plane requires a public HTTPS origin",
    });
    expect(h.stamp).toHaveBeenCalledWith(run.id, expect.objectContaining({
      status: "failed", error_message: "Hosted agent control plane requires a public HTTPS origin",
    }));
    expect(h.harness).not.toHaveBeenCalled();
    expect(h.lease).not.toHaveBeenCalled();
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.allocate).not.toHaveBeenCalled();
    expect(h.database).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(run, "agent_failed");
  },
);
