import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { hasMfaEnabled } from "@/lib/mfa";
import { passwordMeetsPolicy } from "@/lib/password-policy";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  REAUTH_REQUIRED_CODE,
  hasFreshAal2Verification,
} from "@/lib/server/reauth";

/**
 * Completes a password reset behind the same verified-session and MFA boundary
 * as every other authenticated API mutation. A recovery link only creates an
 * AAL1 session; accounts protected by MFA must elevate it to AAL2 first.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (
    hasMfaEnabled(auth.claims.app_metadata) &&
    !hasFreshAal2Verification(auth.claims)
  ) {
    const t = await getTranslations("ApiErrors");
    return NextResponse.json(
      { error: t("mfaReauthTooOld"), code: REAUTH_REQUIRED_CODE },
      { status: 403 }
    );
  }

  let password: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
    const candidate = (body as { password?: unknown }).password;
    if (typeof candidate !== "string" || !passwordMeetsPolicy(candidate)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }
    password = candidate;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { error } = await auth.supabase.auth.updateUser({ password });
  if (error) {
    const status =
      typeof error.status === "number" && error.status >= 400 && error.status < 500
        ? error.status
        : 500;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status }
    );
  }

  return NextResponse.json({ ok: true });
}
