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

describe("maxModelMultiplier", () => {
  it("laisse toujours passer le modèle par défaut de minddy", () => {
    // Le baseline vaut ×1 par construction : un plafond en dessous fermerait
    // l'agent à ce plan-là, y compris sur le modèle que minddy résout tout seul.
    for (const plan of BILLING_PLANS) {
      expect(plan.maxModelMultiplier).toBeGreaterThanOrEqual(1);
    }
  });

  it("monte avec le budget d'usage", () => {
    // L'ordre des deux échelles doit rester le même : un plan qui donnerait plus
    // de budget mais moins de choix de modèle serait un downgrade déguisé.
    for (let i = 1; i < BILLING_PLANS.length; i++) {
      const prev = BILLING_PLANS[i - 1];
      const plan = BILLING_PLANS[i];
      if (plan.includedUsageUsd <= prev.includedUsageUsd) continue;
      expect(plan.maxModelMultiplier).toBeGreaterThan(prev.maxModelMultiplier);
    }
  });
});
