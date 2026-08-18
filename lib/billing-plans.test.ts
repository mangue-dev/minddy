import { describe, expect, it } from "vitest";
import { INITIAL_DATA_MIGRATION, readMigration } from "@/test/sql-migrations";
import {
  BILLABLE_FEATURES,
  BILLING_PLANS,
  USAGE_SEGMENTS,
  getBillingPlan,
  nextBillingPlanId,
} from "./billing-plans";

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

/**
 * L'invariant qui attrape tout seul la feature oubliée (MIN-185). Une feature
 * hors segment n'est refusée par rien : `segmentizeUsage` l'ignore (la barre
 * sous-compte face au total affiché) et `segmentForFeature` retombe sur
 * « Numo » (l'historique la range sous le mauvais nom). Les deux se découvrent
 * sur une facture, des semaines plus tard.
 */
describe("USAGE_SEGMENTS", () => {
  it("range CHAQUE feature facturable dans exactement un segment", () => {
    for (const feature of BILLABLE_FEATURES) {
      const owners = USAGE_SEGMENTS.filter((s) =>
        (s.features as readonly string[]).includes(feature),
      );
      expect(owners.map((s) => s.id), `feature ${feature}`).toHaveLength(1);
    }
  });

  it("ne liste aucune feature qui n'existe pas", () => {
    // Le sens inverse : un segment qui garde le nom d'une feature retirée
    // compterait zéro pour toujours, sans que rien ne le dise.
    for (const segment of USAGE_SEGMENTS) {
      for (const feature of segment.features) {
        expect(BILLABLE_FEATURES, `segment ${segment.id}`).toContain(feature);
      }
    }
  });

  it("donne à chaque segment sa propre couleur de barre", () => {
    const classes = USAGE_SEGMENTS.map((s) => s.barClass);
    expect(new Set(classes).size).toBe(classes.length);
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

/**
 * MIN-348 — le plafond de stockage est le seul champ de plan que TypeScript
 * n'applique pas : l'envoi part du navigateur droit vers le bucket, et c'est la
 * policy SQL qui le refuse, en lisant `plan_storage_quotas`. Deux endroits pour
 * un même nombre, donc, et une seule façon de les tenir d'accord : les comparer.
 */
describe("maxStorageBytes", () => {
  const sql = readMigration(INITIAL_DATA_MIGRATION);

  it("dit la même chose que les données initiales distribuées", () => {
    for (const plan of BILLING_PLANS) {
      const seeded = new RegExp(`'${plan.id}',\\s*(\\d+)`).exec(sql);
      expect(seeded, `le barème SQL ne connaît pas le plan ${plan.id}`).not.toBeNull();
      expect(Number(seeded![1])).toBe(plan.maxStorageBytes);
    }
  });

  it("monte avec le plan — un plan payant ne stocke jamais moins", () => {
    for (let i = 1; i < BILLING_PLANS.length; i++) {
      expect(BILLING_PLANS[i].maxStorageBytes).toBeGreaterThan(
        BILLING_PLANS[i - 1].maxStorageBytes
      );
    }
  });
});
