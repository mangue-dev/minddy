import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const usesByokForSurface = vi.fn();
const getResolvedBilling = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/server/ai-runtime", () => ({ usesByokForSurface }));
vi.mock("@/lib/managed-services", () => ({ isManagedAiEnabled: () => true }));
vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling,
  shouldUseStripePlan: () => false,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ maybeSingle: async () => ({ data: null }) }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/server/ai-usage", () => ({ recordAiUsage: vi.fn() }));

const { ensureUsageBudget, hasUsageBudget } = await import("@/lib/server/usage");

describe("BYOK usage-budget exemptions", () => {
  beforeEach(() => {
    usesByokForSurface.mockReset();
    getResolvedBilling.mockReset().mockResolvedValue({
      account: null,
      plan: { includedUsageUsd: 10 },
    });
    rpc.mockReset().mockResolvedValue({
      data: { total_cost: 10, by_feature: [] },
      error: null,
    });
  });

  it("does not exempt a managed fallback for an unsupported model family", async () => {
    usesByokForSurface.mockResolvedValue(false);

    await expect(
      ensureUsageBudget("user-1", "voice", "transcription_model"),
    ).rejects.toMatchObject({ code: "usage_budget_exceeded" });
    expect(usesByokForSurface).toHaveBeenCalledWith(
      "user-1",
      "voice",
      "transcription_model",
    );
  });

  it("keeps the exemption when BYOK covers the requested model family", async () => {
    usesByokForSurface.mockResolvedValue(true);

    await expect(
      ensureUsageBudget("user-1", "assistant", "assistant_model"),
    ).resolves.toMatchObject({ usedUsd: 10 });
  });

  it("does not grant a surface-only exemption without a model requirement", async () => {
    await expect(hasUsageBudget("user-1", "automations")).resolves.toBe(false);
    expect(usesByokForSurface).not.toHaveBeenCalled();
  });
});
