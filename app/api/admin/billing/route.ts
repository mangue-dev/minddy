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
 * Administration du billing (`/admin` → panneau d'un compte) — MIN-72.
 * Gate identique aux autres endpoints admin : JWT via getClaims + isAdminUser.
 *
 *  GET  ?email=<email>  → l'état billing d'un compte : plan effectif + source
 *                         (admin_override → stripe → free) et l'override posé.
 *  POST { userId, planId, note?, duration? } → offre un plan (`planId` null
 *                         reprend le cadeau) ; prioritaire sur Stripe à la
 *                         résolution.
 *
 * `duration` est une DURÉE, jamais une date : le client dit « un mois », le
 * serveur stampe l'échéance avec sa propre horloge. Absente, l'échéance en
 * place ne bouge pas — un admin qui corrige une note ne relance pas le compte
 * à rebours sans le vouloir.
 *
 * L'override n'écrit QUE les trois colonnes `admin_override_*` — l'état Stripe
 * du compte reste intact, reprendre le cadeau rend son vrai plan à
 * l'utilisateur.
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
  // Un override expiré ne se montre pas : il ne donne déjà plus rien, l'afficher
  // ferait croire à un cadeau en cours.
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
  // null = retirer l'override ; sinon un id de plan valide obligatoirement.
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

  // Durée absente = « garde l'échéance en place » — mais seulement si elle est
  // encore devant : une échéance déjà passée, laissée là par un cadeau fini,
  // rendrait le nouveau expiré à la seconde où on le pose.
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
