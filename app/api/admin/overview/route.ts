import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import {
  fetchAdminOnboardingSignals,
  onboardingOf,
} from "@/lib/server/admin-users";
import {
  fetchAllBillingAccountsForAdmin,
  resolvePlanFromBillingAccount,
  type BillingAccount,
} from "@/lib/server/billing-accounts";
import { BILLING_PLANS, DEFAULT_BILLING_PLAN_ID } from "@/lib/billing-plans";
import type { AdminOverview, AdminOverviewDay } from "@/lib/types";

/** Aggregate reporting only; onboarding and plans keep their shared resolvers. */

const IANA_TZ = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

interface TotalsPayload {
  total_users: number;
  internal_users: number;
  new_7d: number;
  new_30d: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  total_projects: number;
  total_issues: number;
  days: AdminOverviewDay[];
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requested = request.nextUrl.searchParams.get("tz");
  const tz = requested && IANA_TZ.test(requested) ? requested : "UTC";

  const service = getServiceClient();
  try {
    const [totalsRes, accounts, users] = await Promise.all([
      service.rpc("get_admin_user_totals", { p_tz: tz }),
      fetchAllBillingAccountsForAdmin(),
      fetchAdminOnboardingSignals(),
    ]);

    if (totalsRes.error) {
      console.error("[admin/overview] totals failed:", totalsRes.error.message);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    const totals = (totalsRes.data ?? {}) as Partial<TotalsPayload>;

    // Internal accounts count NOWHERE: the PRC has already removed them from
    // its totals, it remains to remove them from the two aggregates calculated here.
    const internalIds = new Set(
      users.filter((row) => row.is_internal).map((row) => row.user_id),
    );

    // Distribution of plans: an account without line `billing_accounts` is on the
    // default plan, so we start from zero for all plans and we do not count
    // as existing lines change.
    const counts = new Map(BILLING_PLANS.map((plan) => [plan.id, 0]));
    const liveIds = new Set(users.map((row) => row.user_id));
    let withAccount = 0;
    for (const account of accounts) {
      if (!account.user_id || !liveIds.has(account.user_id) || internalIds.has(account.user_id)) continue;
      const { planId } = resolvePlanFromBillingAccount(account as BillingAccount);
      counts.set(planId, (counts.get(planId) ?? 0) + 1);
      withAccount++;
    }
    const totalUsers = Number(totals.total_users) || 0;
    counts.set(
      DEFAULT_BILLING_PLAN_ID,
      (counts.get(DEFAULT_BILLING_PLAN_ID) ?? 0) +
        Math.max(totalUsers - withAccount, 0),
    );

    // Funnel: among the accounts to which onboarding was presented, how many
    // completed it, how many passed it.
    const funnel = { started: 0, completed: 0, dismissed: 0 };
    for (const row of users) {
      if (row.is_internal) continue;
      const state = onboardingOf(row);
      if (!state.started) continue;
      funnel.started++;
      if (state.allComplete) funnel.completed++;
      if (state.dismissed) funnel.dismissed++;
    }

    const overview: AdminOverview = {
      totalUsers,
      internalUsers: Number(totals.internal_users) || 0,
      newUsers7d: Number(totals.new_7d) || 0,
      newUsers30d: Number(totals.new_30d) || 0,
      activeToday: Number(totals.active_today) || 0,
      active7d: Number(totals.active_7d) || 0,
      active30d: Number(totals.active_30d) || 0,
      totalProjects: Number(totals.total_projects) || 0,
      totalIssues: Number(totals.total_issues) || 0,
      days: (totals.days ?? []).map((day) => ({
        day: day.day,
        signups: Number(day.signups) || 0,
        active: Number(day.active) || 0,
      })),
      plans: BILLING_PLANS.map((plan) => ({
        planId: plan.id,
        count: counts.get(plan.id) ?? 0,
      })),
      onboarding: funnel,
    };

    return NextResponse.json(overview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[admin/overview] query failed:", (error as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
