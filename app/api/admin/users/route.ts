import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getUserUsage } from "@/lib/server/usage";
import {
  fetchAdminUsers,
  fetchByokUserIds,
  nameOf,
  onboardingOf,
  setUserInternal,
  type AdminUserRpcRow,
} from "@/lib/server/admin-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { getServiceClient } from "@/lib/supabase-service";
import { DEFAULT_BILLING_PLAN_ID, getBillingPlan } from "@/lib/billing-plans";
import { activeAdminOverride } from "@/lib/server/billing-accounts";
import type { AdminUserRow, AdminUsersResponse } from "@/lib/types";

/**
 * `/admin` → onglet « Utilisateurs » (MIN-90). Gate identique aux autres
 * endpoints admin : JWT via getClaims + isAdminUser.
 *
 *  GET   ?search=&limit=&offset= → une ligne par compte : onboarding, projets,
 *        tickets, plan effectif, budget, inscription et dernier signe de vie.
 *  PATCH { userId, internal } → marque le compte comme INTERNE (équipe, démo,
 *        bot) ou le rend au décompte. Un compte interne reste listé et
 *        administrable ici ; il disparaît seulement des statistiques.
 *
 * Le plan et la dépense COMPTÉE passent par `getUserUsage`, qui connaît la vraie
 * fenêtre de chacun (cycle Stripe, sous-cycle mensuel d'un annuel, filigrane de
 * remise à zéro) — la SQL ne renvoie que le mois calendaire brut. C'est ce qui
 * rendait l'ancien onglet « Quotas » juste, et ça reste vrai ici. D'où la page
 * volontairement petite : chaque ligne coûte quelques requêtes.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function intParam(value: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

/** Billing + usage d'un compte ; un échec isolé ne doit pas vider la page. */
async function usageOf(row: AdminUserRpcRow) {
  try {
    const usage = await getUserUsage(row.user_id);
    const account = usage.billing.account;
    const budgetUsd = usage.billing.plan.includedUsageUsd;
    // Un plan offert dont l'échéance est passée ne compte plus nulle part :
    // ni dans le plan effectif (la résolution l'ignore), ni ici.
    const override = activeAdminOverride(account);
    return {
      billing: {
        planId: usage.billing.planId,
        source: usage.billing.source,
        override,
        overrideNote: override ? (account?.admin_override_note ?? null) : null,
        overrideExpiresAt: override
          ? (account?.admin_override_expires_at ?? null)
          : null,
        stripePlanId: account?.stripe_plan_id ?? null,
        stripeStatus: account?.stripe_subscription_status ?? null,
      },
      budgetUsd,
      spentUsd: usage.usedUsd,
      blocked: usage.usedUsd >= budgetUsd,
    };
  } catch (err) {
    console.error("[admin/users] usage failed:", (err as Error).message);
    return {
      billing: {
        planId: DEFAULT_BILLING_PLAN_ID,
        source: "default" as const,
        override: null,
        overrideNote: null,
        overrideExpiresAt: null,
        stripePlanId: null,
        stripeStatus: null,
      },
      budgetUsd: getBillingPlan(DEFAULT_BILLING_PLAN_ID).includedUsageUsd,
      spentUsd: 0,
      blocked: false,
    };
  }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const limit = intParam(params.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const offset = intParam(params.get("offset"), 0, Number.MAX_SAFE_INTEGER);

  let page;
  try {
    page = await fetchAdminUsers({ search: params.get("search"), limit, offset });
  } catch (err) {
    console.error("[admin/users] query failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const [seeds, byokUserIds] = await Promise.all([
    fetchAvatarSeeds(
      getServiceClient(),
      page.rows.map((row) => row.user_id)
    ),
    fetchByokUserIds(),
  ]);

  const users: AdminUserRow[] = await Promise.all(
    page.rows.map(async (row) => {
      const resolved = await usageOf(row);
      return {
        userId: row.user_id,
        name: nameOf(row),
        email: row.email,
        avatarSeed: seeds.get(row.user_id) ?? row.user_id,
        createdAt: row.created_at,
        lastSignInAt: row.last_sign_in_at,
        lastActivityAt: row.last_activity_at,
        emailConfirmed: !!row.email_confirmed_at,
        internal: !!row.is_internal,
        projects: Number(row.projects_owned) + Number(row.projects_member),
        projectsOwned: Number(row.projects_owned),
        issues: Number(row.issues_accessible),
        issuesCreated: Number(row.issues_created),
        onboarding: onboardingOf(row, byokUserIds),
        billing: resolved.billing,
        usage: {
          budgetUsd: resolved.budgetUsd,
          spentUsd: resolved.spentUsd,
          spentMonthUsd: Number(row.spent_month) || 0,
          calls: Number(row.ai_calls) || 0,
          blocked: resolved.blocked,
          resetAt: row.reset_at,
        },
      };
    }),
  );

  return NextResponse.json({ users, total: page.total } satisfies AdminUsersResponse);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH { userId, internal } — bascule le drapeau « compte interne ». */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: unknown; internal?: unknown };
  try {
    const parsed: unknown = await request.json();
    // Corps non-objet (null, chaîne…) : refusé ici plutôt que de crasher plus bas.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { userId?: unknown; internal?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (typeof body.internal !== "boolean") {
    return NextResponse.json({ error: "Invalid internal" }, { status: 400 });
  }

  try {
    await setUserInternal(userId, body.internal);
  } catch (err) {
    console.error("[admin/users] internal toggle failed:", (err as Error).message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ userId, internal: body.internal });
}
