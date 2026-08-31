import { describe, expect, it } from "vitest";

import {
  activeAdminOverride,
  resolveBasePlanFromBillingAccount,
  resolvePlanFromBillingAccount,
  type BillingAccount,
} from "./billing-accounts";

/**
 * The OFFERED plan stops by itself.
 *
 * The deadline is not applied by a cron: it is the RESOLUTION which refuses
 * an expired override, on each reading. This is what guarantees that the right falls
 * to the nearest second even if the time scan is never passed — and what
 * these tests freeze. They also check the catch-up: under the finished gift,
 * the user finds their REAL plan, not free by default.
 */

const NOW = new Date("2026-08-04T09:30:00.000Z").getTime();

function account(overrides: Partial<BillingAccount>): BillingAccount {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    email: null,
    admin_override_plan_id: null,
    admin_override_note: null,
    admin_override_expires_at: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_price_id: null,
    stripe_plan_id: null,
    stripe_subscription_status: null,
    stripe_current_period_start: null,
    stripe_current_period_end: null,
    stripe_cancel_at_period_end: false,
    stripe_checkout_session_id: null,
    stripe_last_event_id: null,
    stripe_last_event_created: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("activeAdminOverride", () => {
  it("tient tant que l'échéance est devant", () => {
    const row = account({
      admin_override_plan_id: "pro",
      admin_override_expires_at: "2026-09-04T09:30:00.000Z",
    });
    expect(activeAdminOverride(row, NOW)).toBe("pro");
  });

  it("tombe dès l'échéance atteinte", () => {
    const row = account({
      admin_override_plan_id: "pro",
      admin_override_expires_at: "2026-08-04T09:29:59.000Z",
    });
    expect(activeAdminOverride(row, NOW)).toBeNull();
  });

  it("ne s'arrête jamais sans échéance — le cadeau d'avant les durées", () => {
    const row = account({ admin_override_plan_id: "pro" });
    expect(activeAdminOverride(row, NOW)).toBe("pro");
  });
});

describe("resolvePlanFromBillingAccount", () => {
  it("rend son abonnement Stripe à qui en a un quand le cadeau finit", () => {
    const row = account({
      admin_override_plan_id: "pro",
      admin_override_expires_at: "2026-08-01T00:00:00.000Z",
      stripe_plan_id: "go",
      stripe_subscription_status: "active",
    });
    expect(resolvePlanFromBillingAccount(row, NOW)).toEqual({
      planId: "go",
      source: "stripe",
    });
  });

  it("retombe sur le plan par défaut quand il n'y a rien dessous", () => {
    const row = account({
      admin_override_plan_id: "pro",
      admin_override_expires_at: "2026-08-01T00:00:00.000Z",
    });
    expect(resolvePlanFromBillingAccount(row, NOW)).toEqual({
      planId: "free",
      source: "default",
    });
  });

  it("passe avant Stripe tant qu'il est valide", () => {
    const row = account({
      admin_override_plan_id: "pro",
      admin_override_expires_at: "2026-09-04T09:30:00.000Z",
      stripe_plan_id: "go",
      stripe_subscription_status: "active",
    });
    expect(resolvePlanFromBillingAccount(row, NOW)).toEqual({
      planId: "pro",
      source: "admin_override",
    });
  });
});

describe("resolveBasePlanFromBillingAccount", () => {
  it("returns the eligible Stripe plan underneath an override", () => {
    const row = account({
      admin_override_plan_id: "pro",
      stripe_plan_id: "go",
      stripe_subscription_status: "active",
    });
    expect(resolveBasePlanFromBillingAccount(row)).toEqual({
      planId: "go",
      source: "stripe",
    });
  });

  it("returns Free when there is no eligible Stripe plan", () => {
    const row = account({
      admin_override_plan_id: "pro",
      stripe_plan_id: "go",
      stripe_subscription_status: "canceled",
    });
    expect(resolveBasePlanFromBillingAccount(row)).toEqual({
      planId: "free",
      source: "default",
    });
  });
});
