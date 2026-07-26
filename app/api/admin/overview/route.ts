import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAdminUsers, onboardingOf } from "@/lib/server/admin-users";
import {
  resolvePlanFromBillingAccount,
  type BillingAccount,
} from "@/lib/server/billing-accounts";
import { BILLING_PLANS, DEFAULT_BILLING_PLAN_ID } from "@/lib/billing-plans";
import type { AdminOverview, AdminOverviewDay } from "@/lib/types";

/**
 * `/admin` → onglet « Vue d'ensemble » (MIN-90). Gate identique aux autres
 * endpoints admin : JWT via getClaims + isAdminUser.
 *
 * GET ?tz=<IANA> → les totaux de l'app (comptes, actifs, projets, tickets), la
 * série d'activité sur 30 jours, la répartition des plans effectifs et
 * l'entonnoir d'onboarding.
 *
 * Les compteurs viennent de la RPC `get_admin_user_totals` ; la répartition des
 * plans et l'entonnoir se calculent ICI, avec les mêmes résolveurs que le reste
 * de l'app (`resolvePlanFromBillingAccount`, `resolveOnboardingState` via
 * `onboardingOf`) — dupliquer ces règles en SQL les ferait diverger au premier
 * changement de produit.
 */

/** Le compte de comptes reste petit ; au-delà la vue n'a plus de sens de toute
 *  façon (il faudrait des agrégats dédiés, pas un scan). */
const FUNNEL_SCAN_LIMIT = 5_000;

const IANA_TZ = /^[A-Za-z][A-Za-z0-9_+\-]*(?:\/[A-Za-z0-9_+\-]+)*$/;

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
  if (!isAdminUser(auth.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requested = request.nextUrl.searchParams.get("tz");
  const tz = requested && IANA_TZ.test(requested) ? requested : "UTC";

  const service = getServiceClient();
  const [totalsRes, accountsRes, page] = await Promise.all([
    service.rpc("get_admin_user_totals", { p_tz: tz }),
    service
      .from("billing_accounts")
      .select(
        "user_id, admin_override_plan_id, stripe_plan_id, stripe_subscription_status",
      ),
    fetchAdminUsers({ search: null, limit: FUNNEL_SCAN_LIMIT, offset: 0 }),
  ]);

  if (totalsRes.error) {
    console.error("[admin/overview] totals failed:", totalsRes.error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  const totals = (totalsRes.data ?? {}) as Partial<TotalsPayload>;

  // Les comptes internes ne comptent NULLE PART : la RPC les a déjà retirés de
  // ses totaux, il reste à les retirer des deux agrégats calculés ici.
  const internalIds = new Set(
    page.rows.filter((row) => row.is_internal).map((row) => row.user_id),
  );

  // Répartition des plans : un compte sans ligne `billing_accounts` est sur le
  // plan par défaut, donc on part de zéro pour tous les plans et on ne compte
  // que ce que les lignes existantes changent.
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

  // Entonnoir : parmi les comptes à qui l'onboarding a été présenté, combien
  // l'ont terminé, combien l'ont passé.
  const funnel = { started: 0, completed: 0, dismissed: 0 };
  for (const row of page.rows) {
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

  return NextResponse.json(overview);
}
