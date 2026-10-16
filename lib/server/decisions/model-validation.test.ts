import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The decision-model gate (MIN-694), cheapest check first: no catalog, no
 * change; a model outside the decision catalog is refused before any call;
 * only a catalog decision model that passes the probe is accepted.
 */

const { getPlatformModelCatalogMock, probeDecisionModelMock } = vi.hoisted(() => ({
  getPlatformModelCatalogMock: vi.fn(),
  probeDecisionModelMock: vi.fn(),
}));

vi.mock("@/lib/server/agent/models-catalog", () => ({
  getPlatformModelCatalog: getPlatformModelCatalogMock,
}));
vi.mock("@/lib/server/decisions/decision-model", () => ({
  probeDecisionModel: probeDecisionModelMock,
}));
vi.mock("@/lib/server/ai-usage", () => ({ newRunId: () => "run-probe" }));

const { validateDecisionModelChoice } = await import("./model-validation");

const CATALOG = [
  { id: "liquid/d1", name: "LiquidAI: d1" },
  { id: "typesafe/jev-1.13", name: "TypeSafe: Jev 1.13" },
];

beforeEach(() => {
  getPlatformModelCatalogMock.mockReset().mockResolvedValue(CATALOG);
  probeDecisionModelMock.mockReset().mockResolvedValue({ ok: true, answers: {}, model: "liquid/d1" });
});

describe("validateDecisionModelChoice", () => {
  it("reads the decision catalog, never the chat one", async () => {
    await validateDecisionModelChoice("liquid/d1");
    expect(getPlatformModelCatalogMock).toHaveBeenCalledWith("decision");
  });

  it("refuses every choice while the catalog is unavailable", async () => {
    getPlatformModelCatalogMock.mockResolvedValue([]);
    await expect(validateDecisionModelChoice("liquid/d1")).resolves.toEqual({
      ok: false,
      status: 503,
      code: "catalog_unavailable",
    });
    expect(probeDecisionModelMock).not.toHaveBeenCalled();
  });

  it("refuses a model outside the decision catalog without calling it", async () => {
    await expect(validateDecisionModelChoice("deepseek/deepseek-v4-flash")).resolves.toEqual({
      ok: false,
      status: 400,
      code: "not_a_decision_model",
    });
    expect(probeDecisionModelMock).not.toHaveBeenCalled();
  });

  it("refuses a catalog decision model that fails the probe, naming why", async () => {
    probeDecisionModelMock.mockResolvedValue({ ok: false, reason: "timeout" });
    await expect(validateDecisionModelChoice("liquid/d1")).resolves.toEqual({
      ok: false,
      status: 422,
      code: "compatibility_check_failed",
      reason: "timeout",
    });
  });

  it("accepts a catalog decision model that answers the probe", async () => {
    await expect(validateDecisionModelChoice("liquid/d1")).resolves.toEqual({ ok: true });
    expect(probeDecisionModelMock).toHaveBeenCalledWith("liquid/d1", "run-probe");
  });
});
