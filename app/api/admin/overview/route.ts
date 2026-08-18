import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAdminUsers, fetchByokUserIds, onboardingOf } from "@/lib/server/admin-users";
import {
  resolvePlanFromBillingAccount,
  type BillingAccount,
} from "@/lib/server/billing-accounts";
import { BILLING_PLANS, DEFAULT_BILLING_PLAN_ID } from "@/lib/billing-plans";
import type { AdminOverview, AdminOverviewDay } from "@/lib/types";

/**
 * `/admin` → “Overview” tab (MIN-90). Gate identical to the others
 * endpoints admin : JWT via getClaims + isAdminUser.
 *
 * GET ?tz=<IANA> → app totals (accounts, assets, projects, tickets), the
 * series of activities over 30 days, the distribution of effective plans and
 * l'entonnoir d'onboarding.
 *
 * Counters come from PRC `get_admin_user_totals`; the distribution of
 * plans and the funnel are calculated HERE, with the same resolvers as the rest
 * de l'app (`resolvePlanFromBillingAccount`, `resolveOnboardingState` via
 * `onboardingOf`) — duplicating these rules in SQL would cause them to diverge at the first
 * changement de produit.
 */

/** The account count remains small; beyond that the view no longer has any meaning at all
 * way (dedicated aggregates would be needed, not a scan). */
const FUNNEL_SCAN_LIMIT = 5_000;

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
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requested = request.nextUrl.searchParams.get("tz");
  const tz = requested && IANA_TZ.test(requested) ? requested : "UTC";

  const service = getServiceClient();
  const [totalsRes, accountsRes, page, byokUserIds] = await Promise.all([
    service.rpc("get_admin_user_totals", { p_tz: tz }),
    service
      .from("billing_accounts")
      .select(
        "user_id, admin_override_plan_id, stripe_plan_id, stripe_subscription_status",
      ),
    fetchAdminUsers({ search: null, limit: FUNNEL_SCAN_LIMIT, offset: 0 }),
    fetchByokUserIds(),
  ]);

  if (totalsRes.error) {
    console.error("[admin/overview] totals failed:", totalsRes.error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  const totals = (totalsRes.data ?? {}) as Partial<TotalsPayload>;

  // Internal accounts count NOWHERE: the PRC has already removed them from
  // its totals, it remains to remove them from the two aggregates calculated here.
  const internalIds = new Set(
    page.rows.filter((row) => row.is_internal).map((row) => row.user_id),
  );

  // Distribution of plans: an account without line `billing_accounts` is on the
  // default plan, so we start from zero for all plans and we do not count
  // as existing lines change.
  const counts = new Map(BILLING_PLANS.map((plan) => [plan.id, 0]));
  const accounts = (accountsRes.data ?? []) as Array<Partial<BillingAccount>>;
  let withAccount = 0;
  for (const account of accounts) {
    if (account.user_id && internalIds.has(account.user_id)) continue;
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
  for (const row of page.rows) {
    if (row.is_internal) continue;
    const state = onboardingOf(row, byokUserIds);
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

  return NextResponse.json(overview);
}
