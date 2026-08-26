import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { disableMfa, enableMfa, getMfaStatus, issueRecoveryCodes } from "@/lib/server/mfa";
import { captureServerEvent } from "@/lib/server/posthog";
import {
  REAUTH_REQUIRED_CODE,
  hasFreshAal2Verification,
  hasFreshPrimaryAuthentication,
} from "@/lib/server/reauth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

const ACTIVATION_LIMIT = { limit: 3, windowMs: 60 * 60_000 };

/**
 * Account second factor (MIN-132).
 *
 * The TOTP enrollment itself (QR, first code) takes place on the client side, against
 * GoTrue: it is the verification of the first code which sets up the session in `aal2`,
 * and only the SDK can do it. These routes hold what the client cannot
 * hold: the `app_metadata.mfa_enabled` flag that the JWT carries (writing
 * reserved for the service key) and recovery codes.
 *
 * No field of the body is taken at its word: the real state can be read at GoTrue.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await getMfaStatus(auth.user.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Activates 2FA: notes the verified factor, sets the flag, and returns the
 * ten recovery codes — the only time they exist in plain text.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (
    !hasFreshAal2Verification(auth.claims) ||
    !hasFreshPrimaryAuthentication(auth.claims)
  ) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json(
      { error: t("mfaReauthTooOld"), code: REAUTH_REQUIRED_CODE },
      { status: 403 }
    );
  }

  const rate = checkSessionRateLimit(auth.user.id, "mfa-activation", ACTIVATION_LIMIT);
  if (!rate.allowed) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json(
      { error: t("tooManyAttempts", { seconds: rate.retryAfter }) },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  try {
    const activated = await enableMfa(auth.user.id);
    if (!activated) {
      return NextResponse.json({ error: "No verified factor" }, { status: 400 });
    }
    const recoveryCodes = await issueRecoveryCodes(auth.user.id);
    captureServerEvent({
      distinctId: auth.user.id,
      event: "mfa_enabled",
      properties: {},
    });
    return NextResponse.json({ recoveryCodes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Disable everything. The global auth guard requires AAL2, and the explicit
 * freshness check below ensures that the second factor was presented again
 * within the reauthentication window.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!hasFreshAal2Verification(auth.claims)) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json(
      { error: t("mfaReauthTooOld"), code: REAUTH_REQUIRED_CODE },
      { status: 403 }
    );
  }

  try {
    await disableMfa(auth.user.id);
    captureServerEvent({
      distinctId: auth.user.id,
      event: "mfa_disabled",
      properties: { via: "settings" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
