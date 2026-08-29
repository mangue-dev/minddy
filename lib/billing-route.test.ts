import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  billing: {
    planId: "pro",
    plan: { id: "pro" },
    source: "admin_override" as "admin_override" | "stripe",
    stripeConfigured: true,
    account: {
      admin_override_expires_at: "2026-09-29T12:00:00.000Z",
      stripe_plan_id: "go",
      stripe_subscription_status: "active",
      stripe_subscription_id: "sub_123",
      stripe_cancel_at_period_end: false,
      stripe_current_period_end: "2026-09-10T12:00:00.000Z",
    },
  },
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "user-1" } }),
}));

vi.mock("@/lib/server/billing-accounts", () => ({
  getResolvedBilling: async () => mocks.billing,
  resolveBasePlanFromBillingAccount: (account: {
    stripe_plan_id: "free" | "go" | "pro" | null;
    stripe_subscription_status: string | null;
  }) => ({
    planId:
      account.stripe_subscription_status === "active"
        ? (account.stripe_plan_id ?? "free")
        : "free",
    source: account.stripe_subscription_status === "active" ? "stripe" : "default",
  }),
}));

vi.mock("@/lib/managed-services", () => ({
  managedServices: () => ({ billing: true, ai: true }),
}));

const { GET } = await import("@/app/api/billing/route");

describe("GET /api/billing", () => {
  beforeEach(() => {
    mocks.billing.source = "admin_override";
  });

  it("returns the active override deadline and underlying plan", async () => {
    const response = await GET(new NextRequest("https://minddy.app/api/billing"));

    expect(await response.json()).toMatchObject({
      planId: "pro",
      source: "admin_override",
      adminOverride: {
        expiresAt: "2026-09-29T12:00:00.000Z",
        basePlanId: "go",
      },
      subscription: {
        cancelAtPeriodEnd: false,
        currentPeriodEnd: "2026-09-10T12:00:00.000Z",
      },
    });
  });

  it("omits override details when the effective plan has another source", async () => {
    mocks.billing.source = "stripe";

    const response = await GET(new NextRequest("https://minddy.app/api/billing"));

    expect((await response.json()).adminOverride).toBeNull();
  });
});
