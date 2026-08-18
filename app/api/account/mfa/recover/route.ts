import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { consumeRecoveryCode, disableMfa, getMfaStatus } from "@/lib/server/mfa";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * “I No Longer Have My Phone” (MIN-132) — the ONLY route served in `aal1` on
 * a protected account, and therefore the only one to set up `getAuthedUser` with
 * `allowAal1`. You still need a valid session: a recovery code
 * is not an identifier, it is the second factor of someone who has already
 * gave his password (or went through Google / GitHub).
 *
 * A consumed code does not issue a `aal2` — only GoTrue can strike one. He
 * DEACTIVATES 2FA: the postmen leave, the flag falls, the count
 * becomes accessible again in `aal1`. It's more honest than an elevation
 * silent, and it tells the person what they have to do: reactivate.
 *
 * Ten attempts per minute: enough to make a copying mistake, not enough to scan
 * a 40-bit space.
 */

const RECOVERY_LIMIT = { limit: 10, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request, { allowAal1: true });
  if (!auth.ok) return auth.response;

  const t = await getTranslations("ApiErrors");

  const rate = checkSessionRateLimit(auth.user.id, "mfa-recover", RECOVERY_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: t("tooManyAttempts", { seconds: rate.retryAfter }) },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  let body: { code?: string };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here, not 500 below.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { code?: string };
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  try {
    // An account without 2FA has nothing to recover. We tell it like it is: the session
    // is already that of the person, there is nothing to protect by vagueness.
    const status = await getMfaStatus(auth.user.id);
    if (!status.enabled) {
      return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
    }

    // A typed code is around ten characters long: well beyond that, it’s a
    // forged body — no need to standardize and chop it up.
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 64) {
      return NextResponse.json({ error: t("invalidRecoveryCode") }, { status: 400 });
    }

    const consumed = await consumeRecoveryCode(auth.user.id, code);
    if (!consumed) {
      return NextResponse.json({ error: t("invalidRecoveryCode") }, { status: 400 });
    }

    await disableMfa(auth.user.id);
    captureServerEvent({
      distinctId: auth.user.id,
      event: "mfa_disabled",
      properties: { via: "recovery_code" },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
