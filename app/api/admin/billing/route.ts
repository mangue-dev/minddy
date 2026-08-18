import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { findAuthUserByEmail } from "@/lib/server/auth-users";
import {
  activeAdminOverride,
  getBillingAccountForUser,
  getResolvedBilling,
  upsertBillingAccount,
} from "@/lib/server/billing-accounts";
import { coerceBillingPlanId } from "@/lib/billing-plans";
import {
  coerceGiftDuration,
  giftExpiresAt,
  isGiftExpired,
} from "@/lib/billing-gift";
import { displayName } from "@/lib/display-name";

/**
 * Billing administration (`/admin` → account panel) — MIN-72.
 * Same gate as other admin endpoints: JWT via getClaims + isAdminUser.
 *
 * GET ?email=<email> → the billing status of an account: effective plan + source
 * (admin_override → stripe → free) and the override set.
 *  POST { userId, planId, note?, duration? } → grants a plan (`planId` null
 * takes back the gift); Stripe remains the priority
 * resolution.
 *
 * `duration` is a DURATION, never a date: the client says “one month”, the
 * server stamps the deadline with its own clock. Absent, the deadline in
 * place does not move — an admin who corrects a note does not restart the account
 * backwards without wanting to.
 *
 * Override ONLY writes the three `admin_override_*` columns — Stripe state
 * of the account remains intact, taking back the gift makes his real plan to
 * the user.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!(await isAdminUser(auth.user))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true };
}

async function billingStateOf(userId: string) {
  const [billing, account] = await Promise.all([
    getResolvedBilling(userId),
    getBillingAccountForUser(userId),
  ]);
  // An expired override is not shown: it already doesn't give anything anymore, display it
  // would make it seem like a gift in progress.
  const override = activeAdminOverride(account);
  return {
    userId,
    planId: billing.planId,
    source: billing.source,
    stripePlanId: account?.stripe_plan_id ?? null,
    override,
    note: override ? (account?.admin_override_note ?? null) : null,
    expiresAt: override ? (account?.admin_override_expires_at ?? null) : null,
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const service = getServiceClient();
  const user = await findAuthUserByEmail(service, email);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const meta = user.user_metadata as
    | { display_name?: string; full_name?: string }
    | undefined;
  const state = await billingStateOf(user.id);
  return NextResponse.json({
    ...state,
    name: displayName(
      { full_name: meta?.display_name ?? meta?.full_name, email: user.email },
      "—"
    ),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = (body ?? {}) as {
    userId?: unknown;
    planId?: unknown;
    note?: unknown;
    duration?: unknown;
  };

  const userId = typeof input.userId === "string" ? input.userId : "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  // null = remove the override; otherwise a valid plan ID is required.
  const planId = input.planId == null ? null : coerceBillingPlanId(input.planId);
  if (input.planId != null && planId == null) {
    return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
  }
  const duration =
    input.duration == null ? null : coerceGiftDuration(input.duration);
  if (input.duration != null && duration == null) {
    return NextResponse.json({ error: "Invalid duration" }, { status: 400 });
  }
  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, 500)
      : null;

  // Duration absent = “keeps the deadline in place” — but only if it is
  // still ahead: a deadline already passed, left there by a finished gift,
  // would make the new one expire the second you put it down.
  const current = await getBillingAccountForUser(userId);
  const kept = isGiftExpired(current?.admin_override_expires_at)
    ? null
    : (current?.admin_override_expires_at ?? null);
  const expiresAt = !planId
    ? null
    : duration
      ? giftExpiresAt(duration)
      : kept;

  await upsertBillingAccount(userId, {
    admin_override_plan_id: planId,
    admin_override_note: planId ? note : null,
    admin_override_expires_at: expiresAt,
  });

  return NextResponse.json(await billingStateOf(userId));
}
