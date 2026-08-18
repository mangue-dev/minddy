import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { deleteAccount } from "@/lib/server/account-deletion";
import { captureServerEvent } from "@/lib/server/posthog";
import {
  REAUTH_REQUIRED_CODE,
  hasPasswordIdentity,
  isRecentlyAuthenticated,
  verifyAccountPassword,
} from "@/lib/server/reauth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * Right to erasure (MIN-119, GDPR art. 17) — the person deletes their
 * account itself, without going through an email to process by hand.
 *
 * The body should repeat the account address (`{ confirm }`). It's not about
 * authentication — the session has already done it — but a switchblade: a
 * DELETE starts with a click, and it does not catch up.
 *
 * ## And a re-authentication on top (MIN-345)
 *
 * The switchblade protects from clumsiness, not from anyone else. This gesture
 * cascades the owned projects, their tickets, their files and
 * access of their members: an open session found on a workstation
 * unlocked should not be enough. We therefore ask for the password again, or —
 * OAuth account, there is none — an authentication less than a year old
 * quarter of an hour. The details of the choice are in `lib/server/reauth.ts`.
 */

export const maxDuration = 60;

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: { confirm?: string; password?: string };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { confirm?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = auth.user.email ?? "";
  const confirm = (typeof body.confirm === "string" ? body.confirm : "")
    .trim()
    .toLowerCase();
  if (!email || confirm !== email.toLowerCase()) {
    return NextResponse.json({ error: "Confirmation mismatch" }, { status: 400 });
  }

  // The flow BEFORE password verification: without it, this route
  // becomes a password oracle for anyone holding a stolen session.
  const rate = checkSessionRateLimit(auth.user.id, "account:delete", { limit: 5 });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: t("tooManyAttempts", { seconds: rate.retryAfter }) },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  if (hasPasswordIdentity(auth.user.app_metadata)) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json(
        { error: t("reauthPasswordRequired"), code: REAUTH_REQUIRED_CODE },
        { status: 403 }
      );
    }
    if (!(await verifyAccountPassword(email, password))) {
      return NextResponse.json({ error: t("reauthPasswordInvalid") }, { status: 403 });
    }
  } else if (!isRecentlyAuthenticated(auth.claims)) {
    return NextResponse.json(
      { error: t("reauthTooOld"), code: REAUTH_REQUIRED_CODE },
      { status: 403 }
    );
  }

  // Issued BEFORE deletion: afterward, the identifier no longer designates anyone and
  // the event would be linked to a ghost.
  captureServerEvent({ distinctId: auth.user.id, event: "account_deleted", properties: {} });

  try {
    const result = await deleteAccount(auth.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
