import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const users = Array.from({ length: 5_001 }, (_, index) => ({
  user_id: `user-${index}`,
  is_internal: false,
  meta: {
    started: true,
    complete: index === 0,
    dismissed: index === 5_000,
  },
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: { id: "admin", email: "admin@example.test", app_metadata: { role: "admin" } },
  }),
}));
vi.mock("@/lib/server/admin", () => ({ isAdminUser: async () => mocks.allowed }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: async () => ({
      data: { total_users: 5_001, internal_users: 0, days: [] },
      error: null,
    }),
  }),
}));
vi.mock("@/lib/server/admin-users", () => ({
  fetchAdminOnboardingSignals: async () => {
    if (mocks.fail) throw new Error("Database unavailable");
    return [...users, { user_id: "internal", is_internal: true, meta: { started: true, complete: true, dismissed: true } }];
  },
  onboardingOf: (row: (typeof users)[number]) => ({
    started: row.meta.started,
    allComplete: row.meta.complete,
    dismissed: row.meta.dismissed,
  }),
}));
vi.mock("@/lib/server/billing-accounts", () => ({
  fetchAllBillingAccountsForAdmin: async () => [
    {
      user_id: "user-0",
      stripe_plan_id: "pro",
      stripe_subscription_status: "active",
    },
    { user_id: "internal", stripe_plan_id: "pro" },
    { user_id: "deleted", stripe_plan_id: "pro" },
  ],
  resolvePlanFromBillingAccount: (account: { stripe_plan_id?: string }) => ({
    planId: account.stripe_plan_id ?? "free",
  }),
}));

const mocks = vi.hoisted(() => ({ allowed: true, fail: false }));

const { GET } = await import("@/app/api/admin/overview/route");

beforeEach(() => { mocks.allowed = true; mocks.fail = false; });

describe("GET /api/admin/overview", () => {
  it("aggregates every account in a dataset larger than 5,000", async () => {
    const response = await GET(
      new NextRequest("https://minddy.app/api/admin/overview?tz=UTC"),
    );
    const overview = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(overview)).not.toContain("user-0");
    expect(overview.plans).toEqual([
      { planId: "free", count: 5_000 },
      { planId: "go", count: 0 },
      { planId: "pro", count: 1 },
    ]);
    expect(overview.onboarding).toEqual({
      started: 5_001,
      completed: 1,
      dismissed: 1,
    });
  });
  it("returns a controlled error when a signal scan fails", async () => {
    mocks.fail = true;
    const response = await GET(new NextRequest("https://minddy.app/api/admin/overview"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Query failed" });
  });
  it("refuses non-admin requests", async () => {
    mocks.allowed = false;
    expect((await GET(new NextRequest("https://minddy.app/api/admin/overview"))).status).toBe(403);
  });
});
