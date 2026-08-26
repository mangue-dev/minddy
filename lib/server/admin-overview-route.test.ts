import { describe, expect, it, vi } from "vitest";
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
vi.mock("@/lib/server/admin", () => ({ isAdminUser: async () => true }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: async () => ({
      data: { total_users: 5_001, internal_users: 0, days: [] },
      error: null,
    }),
  }),
}));
vi.mock("@/lib/server/admin-users", () => ({
  fetchAllAdminUsers: async () => users,
  fetchByokUserIds: async () => new Set<string>(),
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
  ],
  resolvePlanFromBillingAccount: (account: { stripe_plan_id?: string }) => ({
    planId: account.stripe_plan_id ?? "free",
  }),
}));

const { GET } = await import("@/app/api/admin/overview/route");

describe("GET /api/admin/overview", () => {
  it("aggregates every account in a dataset larger than 5,000", async () => {
    const response = await GET(
      new NextRequest("https://minddy.app/api/admin/overview?tz=UTC"),
    );
    const overview = await response.json();

    expect(response.status).toBe(200);
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
});
