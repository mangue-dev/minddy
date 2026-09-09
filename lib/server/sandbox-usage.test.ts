import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: vi.fn() }));
vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: vi.fn(),
  shouldUseStripePlan: vi.fn(),
}));
vi.mock("@/lib/server/ai-runtime", () => ({ usesByokForSurface: vi.fn() }));
vi.mock("@/lib/server/ai-usage", () => ({ recordAiUsage: vi.fn() }));

import { recordAiUsage } from "./ai-usage";
import { sandboxBillingFor } from "@/lib/agent-sandbox-config";
import { recordSandboxUsage } from "./usage";

beforeEach(() => vi.clearAllMocks());

describe("managed sandbox usage billing", () => {
  it.each(["sandbox_compute", "routine_compute"] as const)(
    "records ten minutes of %s at the 8 GiB estimate",
    async (feature) => {
      await recordSandboxUsage({
        runId: "run-1",
        seq: 7,
        feature,
        billTo: { userId: "user-1" },
        projectId: "project-1",
        durationMs: 600_000,
      });

      expect(recordAiUsage).toHaveBeenCalledExactlyOnceWith({
        runId: "run-1",
        seq: 7,
        feature,
        billTo: { userId: "user-1" },
        projectId: "project-1",
        provider: "vercel",
        model: "vercel/sandbox",
        cost: 0.04,
      });
    },
  );

  it("prorates partial minutes", async () => {
    await recordSandboxUsage({
      runId: "run-1",
      seq: 0,
      billTo: { userId: "user-1" },
      projectId: null,
      durationMs: 30_000,
    });

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "sandbox_compute", cost: 0.002 }),
    );
  });

  it("does not record an empty duration", async () => {
    await recordSandboxUsage({
      runId: "run-1",
      seq: 0,
      billTo: { userId: "user-1" },
      projectId: null,
      durationMs: 0,
    });

    expect(recordAiUsage).not.toHaveBeenCalled();
  });
});


describe("allocation-specific sandbox billing", () => {
  it.each([
    ["iad1", 4, 0.04], ["iad1", 8, 0.08],
    ["dub1", 4, 0.052467], ["dub1", 8, 0.104933],
  ] as const)("bills ten minutes in %s with %i vCPUs", async (region, vcpus, cost) => {
    const billing = sandboxBillingFor({ region, vcpus, memoryMb: vcpus * 2048 });
    await recordSandboxUsage({
      runId: "run-1", seq: 0, billTo: { userId: "user-1" }, projectId: null,
      feature: "routine_compute", durationMs: 600_000, usdPerMinute: billing.usdPerMinute,
    });
    expect(recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ cost, feature: "routine_compute" }));
  });
  it.each([NaN, Infinity, -1, 0])("rejects an invalid persisted rate: %s", async (usdPerMinute) => {
    await expect(recordSandboxUsage({
      runId: "run-1", seq: 0, billTo: { userId: "user-1" }, projectId: null,
      durationMs: 600_000, usdPerMinute,
    })).rejects.toThrow("Invalid sandbox usage rate");
    expect(recordAiUsage).not.toHaveBeenCalled();
  });
});
