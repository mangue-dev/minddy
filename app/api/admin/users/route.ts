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
 * `/admin` → “Users” tab (MIN-90). Gate identical to the others
 * endpoints admin : JWT via getClaims + isAdminUser.
 *
 * GET ?search=&limit=&offset= → one line per account: onboarding, projects,
 * tickets, effective plan, budget, registration and last sign of life.
 * PATCH { userId, internal } → marks the account as INTERNAL (team, demo,
 * bot) or returns it to the count. An internal account remains listed and
 * administrable here; it only disappears from the statistics.
 *
 * The plan and the COUNTED expense go through `getUserUsage`, who knows the real
 * window of each (Stripe cycle, monthly sub-cycle of an annual, watermark of
 * reset) — the SQL only returns the raw calendar month. This is what
 * made the old “Quotas” tab fair, and it remains true here. Hence the page
 * intentionally small: each line costs a few queries.
 */

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

function intParam(value: string | null, fallback: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

/** Billing + use of an account; an isolated failure should not clear the page. */
async function usageOf(row: AdminUserRpcRow) {
  try {
    const usage = await getUserUsage(row.user_id);
    const account = usage.billing.account;
    const budgetUsd = usage.billing.plan.includedUsageUsd;
    // A plan offered whose expiry date has passed no longer counts anywhere:
    // neither in the actual plan (the resolution ignores this), nor here.
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

/** PATCH { userId, internal } — toggles the “internal account” flag. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: unknown; internal?: unknown };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
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
