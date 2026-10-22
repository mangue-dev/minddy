import { beforeEach, describe, expect, it, vi } from "vitest";

const { getResolvedBilling, getOpenRouterModelInfo, getAppConfigValues } = vi.hoisted(() => ({
  getResolvedBilling: vi.fn(),
  getOpenRouterModelInfo: vi.fn(),
  getAppConfigValues: vi.fn(),
}));

vi.mock("@/lib/server/billing-accounts", () => ({ getResolvedBilling }));
vi.mock("./openrouter-index", () => ({ getOpenRouterModelInfo }));
vi.mock("@/lib/server/app-config", () => ({ getAppConfigValues }));

import { aiModelFallback, PRICING_BASELINE_CONFIG_KEY } from "@/lib/ai-model-config";
import { ensureModelInPlan, getBaselinePricing } from "./model-plan";

const PRICING = { inputUsdPerMTok: 1, outputUsdPerMTok: 1 };

beforeEach(() => {
  getResolvedBilling.mockReset();
  getResolvedBilling.mockResolvedValue({
    plan: { id: "free", maxModelMultiplier: 1 },
  });
  getAppConfigValues.mockReset();
  getAppConfigValues.mockResolvedValue({});
  getOpenRouterModelInfo.mockReset();
  getOpenRouterModelInfo.mockImplementation(async (model: string) =>
    model === aiModelFallback(PRICING_BASELINE_CONFIG_KEY)
      ? { pricing: PRICING }
      : { pricing: { inputUsdPerMTok: 2, outputUsdPerMTok: 2 } },
  );
});

describe("ensureModelInPlan", () => {
  it("reuses admission billing while still enforcing its model ceiling", async () => {
    const admittedBilling = await getResolvedBilling("user-1");
    getResolvedBilling.mockClear();
    await expect(ensureModelInPlan({
      userId: "user-1", model: "provider/above-free", mode: "platform", admittedBilling,
    })).rejects.toMatchObject({ code: "model_above_plan" });
    expect(getResolvedBilling).not.toHaveBeenCalled();
  });
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

describe("getBaselinePricing", () => {
  it("prices the scale on Numo's admin model, without its routing suffix", async () => {
    getAppConfigValues.mockResolvedValue({
      [PRICING_BASELINE_CONFIG_KEY]: "provider/admin-numo",
      [`${PRICING_BASELINE_CONFIG_KEY}_suffix`]: "nitro",
    });
    getOpenRouterModelInfo.mockImplementation(async (model: string) =>
      model === "provider/admin-numo" ? { pricing: { inputUsdPerMTok: 3, outputUsdPerMTok: 5 } } : null,
    );

    await expect(getBaselinePricing()).resolves.toEqual({ inputUsdPerMTok: 3, outputUsdPerMTok: 5 });
  });

  it("falls back to the code default when the admin row is unset", async () => {
    await expect(getBaselinePricing()).resolves.toEqual(PRICING);
  });
});
