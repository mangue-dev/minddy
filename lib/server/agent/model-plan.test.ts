import { beforeEach, describe, expect, it, vi } from "vitest";

const { getResolvedBilling, getOpenRouterModelInfo } = vi.hoisted(() => ({
  getResolvedBilling: vi.fn(),
  getOpenRouterModelInfo: vi.fn(),
}));

vi.mock("@/lib/server/billing-accounts", () => ({ getResolvedBilling }));
vi.mock("./model", () => ({ getRootDefaultModel: vi.fn(async () => "minddy/default") }));
vi.mock("./openrouter-index", () => ({ getOpenRouterModelInfo }));

import { ensureModelInPlan } from "./model-plan";

const PRICING = { inputUsdPerMTok: 1, outputUsdPerMTok: 1 };

beforeEach(() => {
  getResolvedBilling.mockReset();
  getResolvedBilling.mockResolvedValue({
    plan: { id: "free", maxModelMultiplier: 1 },
  });
  getOpenRouterModelInfo.mockReset();
  getOpenRouterModelInfo.mockImplementation(async (model: string) =>
    model === "minddy/default"
      ? { pricing: PRICING }
      : { pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 2 } },
  );
});

describe("ensureModelInPlan", () => {
  it("enforces the Free 1× ceiling on minddy-quota model choices", async () => {
    await expect(
      ensureModelInPlan({
        userId: "user-1",
        model: "provider/above-free",
        mode: "platform",
      }),
    ).rejects.toMatchObject({
      code: "model_above_plan",
      params: { limit: 1, multiplier: 2, plan: "Free" },
    });
  });

  it("allows the default-priced model on Free", async () => {
    getOpenRouterModelInfo.mockImplementation(async () => ({ pricing: PRICING }));

    await expect(
      ensureModelInPlan({
        userId: "user-1",
        model: "provider/default-priced",
        mode: "platform",
      }),
    ).resolves.toBeUndefined();
  });

  it("does not cap BYOK model choices", async () => {
    await expect(
      ensureModelInPlan({
        userId: "user-1",
        model: "provider/above-free",
        mode: "byok",
      }),
    ).resolves.toBeUndefined();
  });
});
