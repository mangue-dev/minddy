import { describe, expect, it } from "vitest";
import { BILLING_PLANS, getBillingPlan, nextBillingPlanId } from "./billing-plans";

/**
 * L'échelle des plans, du point de vue de « que proposer à quelqu'un qui a épuisé
 * son budget ? ». Ce qui compte : ne jamais proposer une impasse — un plan qui
 * n'existe pas, ou qui ne donnerait pas plus de budget.
 */

describe("nextBillingPlanId", () => {
  it("propose le plan au-dessus tant qu'il en existe un", () => {
    expect(nextBillingPlanId("free")).toBe("go");
    expect(nextBillingPlanId("go")).toBe("pro");
  });

  it("ne propose RIEN au sommet de l'échelle", () => {
    // Sans ça, la carte de budget épuisé offrirait un upgrade inexistant.
    const top = BILLING_PLANS[BILLING_PLANS.length - 1];
    expect(nextBillingPlanId(top.id)).toBeNull();
  });

  it("ne propose que des plans qui donnent PLUS de budget, et qui ont les agents", () => {
    for (const plan of BILLING_PLANS) {
      const next = nextBillingPlanId(plan.id);
      if (!next) continue;
      const target = getBillingPlan(next);
      expect(target.includedUsageUsd).toBeGreaterThan(plan.includedUsageUsd);
      expect(target.allowAgents).toBe(true);
    }
  });
});
