import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getMfaStatus, issueRecoveryCodes } from "@/lib/server/mfa";
import {
  REAUTH_REQUIRED_CODE,
  hasFreshAal2Verification,
} from "@/lib/server/reauth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

const REGENERATION_LIMIT = { limit: 3, windowMs: 60 * 60_000 };

/**
 * Regenerates all ten recovery codes (MIN-132). The previous ones — consumed
 * or not — immediately cease to be valid: it is the gesture we make when we
 * doesn't know where the leaf is anymore, so half replacing it wouldn't make sense.
 *
 * The global auth guard rejects AAL1, while the route-specific check also
 * requires that the second factor was presented recently.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!hasFreshAal2Verification(auth.claims)) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json(
      { error: t("mfaReauthTooOld"), code: REAUTH_REQUIRED_CODE },
      { status: 403 }
    );
  }

  const rate = checkSessionRateLimit(
    auth.user.id,
    "mfa-recovery-codes",
    REGENERATION_LIMIT
  );
  if (!rate.allowed) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json(
      { error: t("tooManyAttempts", { seconds: rate.retryAfter }) },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  try {
    const status = await getMfaStatus(auth.user.id);
    if (!status.enabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }
    return NextResponse.json({ recoveryCodes: await issueRecoveryCodes(auth.user.id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
