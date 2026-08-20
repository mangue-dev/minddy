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
 * The scale of the plans, from the point of view of "what to offer to someone who has exhausted
 * their budget?" ". What matters: never propose a dead end — a plan that
 * doesn't exist, or that wouldn't result in more budget.
 */

describe("nextBillingPlanId", () => {
  it("propose le plan au-dessus tant qu'il en existe un", () => {
    expect(nextBillingPlanId("free")).toBe("go");
    expect(nextBillingPlanId("go")).toBe("pro");
  });

  it("ne propose RIEN au sommet de l'échelle", () => {
    // Without it, the exhausted budget card would offer a non-existent upgrade.
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
 * The invariant which catches the forgotten feature by itself (MIN-185). A feature
 * outside the segment is not refused by anything: `segmentizeUsage` ignores it (the bar
 * subcounts against the total displayed) and `segmentForFeature` falls on
 * “Numo” (the history puts it under the wrong name). The two discover each other
 * on an invoice, weeks later.
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
    // The opposite direction: a segment which keeps the name of a removed feature
    // would count zero forever, without anything saying so.
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
    // The baseline is worth ×1 by construction: a ceiling below would close
    // the agent on this plan, including on the model that Minddy solves on her own.
    for (const plan of BILLING_PLANS) {
      expect(plan.maxModelMultiplier).toBeGreaterThanOrEqual(1);
    }
  });

  it("monte avec le budget d'usage", () => {
    // The order of the two scales must remain the same: a plan which would give more
    // budget but fewer model choices would be a disguised downgrade.
    for (let i = 1; i < BILLING_PLANS.length; i++) {
      const prev = BILLING_PLANS[i - 1];
      const plan = BILLING_PLANS[i];
      if (plan.includedUsageUsd <= prev.includedUsageUsd) continue;
      expect(plan.maxModelMultiplier).toBeGreaterThan(prev.maxModelMultiplier);
    }
  });
});

describe("structural plan limits", () => {
  it("keeps Free small and makes every paid plan unlimited", () => {
    const [free, ...paid] = BILLING_PLANS;

    expect(free).toMatchObject({
      maxProjects: 2,
      maxIssuesPerProject: 300,
      maxMembersPerProject: 3,
      allowAgents: true,
      maxModelMultiplier: 1,
    });
    for (const plan of paid) {
      expect(plan).toMatchObject({
        maxProjects: null,
        maxIssuesPerProject: null,
        maxMembersPerProject: null,
        allowAgents: true,
      });
    }
  });
});

/**
 * MIN-348 — the storage cap is the only plan field that TypeScript
 * does not apply: the sending goes from the right browser to the bucket, and it is the
 * SQL policy that refuses it, reading `plan_storage_quotas`. Two places for
 * the same number, therefore, and only one way to keep them in agreement: compare them.
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
