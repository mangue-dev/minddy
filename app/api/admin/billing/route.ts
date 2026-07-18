import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { findAuthUserByEmail } from "@/lib/server/auth-users";
import {
  getBillingAccountForUser,
  getResolvedBilling,
  upsertBillingAccount,
} from "@/lib/server/billing-accounts";
import { coerceBillingPlanId } from "@/lib/billing-plans";
import { displayName } from "@/lib/display-name";

/**
 * Administration du billing (`/admin` → onglet « Facturation ») — MIN-72.
 * Gate identique aux autres endpoints admin : JWT via getClaims + isAdminUser.
 *
 *  GET  ?email=<email>  → l'état billing d'un compte : plan effectif + source
 *                         (admin_override → stripe → free) et l'override posé.
 *  POST { userId, planId, note? } → pose l'override admin (`planId` null le
 *                         retire) ; prioritaire sur Stripe à la résolution.
 *
 * L'override n'écrit QUE `admin_override_plan_id`/`_note` — l'état Stripe du
 * compte reste intact, retirer l'override rend son vrai plan à l'utilisateur.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!isAdminUser(auth.user)) {
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
  return {
    userId,
    planId: billing.planId,
    source: billing.source,
    stripePlanId: account?.stripe_plan_id ?? null,
    override: coerceBillingPlanId(account?.admin_override_plan_id),
    note: account?.admin_override_note ?? null,
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
  };

  const userId = typeof input.userId === "string" ? input.userId : "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  // null = retirer l'override ; sinon un id de plan valide obligatoirement.
  const planId = input.planId == null ? null : coerceBillingPlanId(input.planId);
  if (input.planId != null && planId == null) {
    return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
  }
  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim().slice(0, 500)
      : null;

  await upsertBillingAccount(userId, {
    admin_override_plan_id: planId,
    admin_override_note: planId ? note : null,
  });

  return NextResponse.json(await billingStateOf(userId));
}
