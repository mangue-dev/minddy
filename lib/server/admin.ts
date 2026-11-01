import "server-only";

import type { User } from "@supabase/supabase-js";

import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserAlongside, type AuthedResult } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { hasMfaEnabled } from "@/lib/mfa";
import { BACKEND_REQUEST_TIMEOUT_MS } from "@/lib/backend-availability";

async function withBackendDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("live authorization check timed out")),
          BACKEND_REQUEST_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Central authorization gate for the admin dashboard and every admin API. */
export function adminEmailAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** Whether an address is currently present in `ADMIN_EMAILS`. */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmailAllowlist().includes(email.trim().toLowerCase());
}

/** Whether signed application metadata grants the admin role. */
export function hasAdminRole(
  user: Pick<User, "app_metadata"> | null | undefined
): boolean {
  return (user?.app_metadata as { role?: string } | undefined)?.role === "admin";
}

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Claims an admin session must carry before any live lookup is worth making. */
function hasAdminSessionClaims(
  user: Pick<User, "id"> | null | undefined,
  claims: Record<string, unknown> | null | undefined,
): user is Pick<User, "id"> {
  const sessionId = typeof claims?.session_id === "string" ? claims.session_id : "";
  return !!user?.id && claims?.sub === user.id && claims?.aal === "aal2" &&
    SESSION_ID_PATTERN.test(sessionId);
}

/** Whether the live Auth account is an enrolled, unbanned, allowlisted admin. */
function isAdminAccount(user: Pick<User, "id">, account: User | null | undefined): boolean {
  const hasVerifiedFactor = account?.factors?.some(
    (factor) => factor.status === "verified",
  );
  const bannedUntil = account?.banned_until
    ? Date.parse(account.banned_until)
    : Number.NaN;
  if (
    !account ||
    account.id !== user.id ||
    !hasMfaEnabled(account.app_metadata) ||
    !hasVerifiedFactor ||
    (Number.isFinite(bannedUntil) && bannedUntil > Date.now())
  )
    return false;
  if (hasAdminRole(account)) return true;
  return !!account.email_confirmed_at && isAdminEmail(account.email);
}

/**
 * Revalidates every privileged request against the live Auth account and live
 * session. Access-token claims can remain cryptographically valid after role,
 * MFA, password, or session revocation, so no positive admin result is cached.
 */
export async function isAdminUser(
  user: Pick<User, "id"> | null | undefined,
  claims: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  if (!hasAdminSessionClaims(user, claims)) return false;
  const sessionId = claims!.session_id as string;

  try {
    const service = getServiceClient();
    const [accountResult, sessionResult] = await withBackendDeadline(
      Promise.all([
        service.auth.admin.getUserById(user.id),
        service.rpc("auth_authorization_state", {
          p_user: user.id,
          p_session: sessionId,
          p_aal: claims?.aal,
          p_amr: Array.isArray(claims?.amr) ? claims.amr : [],
        }),
      ]),
    );
    if (accountResult.error) throw new Error(accountResult.error.message);
    if (sessionResult.error) throw new Error(sessionResult.error.message);
    const liveState = sessionResult.data;
    if (
      !liveState ||
      typeof liveState !== "object" ||
      Array.isArray(liveState) ||
      liveState.sessionActive !== true ||
      liveState.mfaAllowed !== true
    )
      return false;
    return isAdminAccount(user, accountResult.data?.user);
  } catch (error) {
    console.error("[admin] live authorization check failed:", (error as Error).message);
    return false;
  }
}

/**
 * Authenticate and authorize an admin API request with ONE authorization
 * lookup. `getAuthedUser` already makes the live session and MFA lookup
 * (`auth_authorization_state`, with the same parameters `isAdminUser` sends),
 * so the Auth account read runs alongside it and the lookup is not repeated.
 * The outcome is that of `getAuthedUser` followed by `isAdminUser`: the same
 * 401, 403 MFA and 503 responses, then 403 unless the signed claims carry an
 * AAL2 session and the live account is an admin. Any failure denies.
 */
export async function getAuthedAdmin(
  request: NextRequest,
): Promise<Extract<AuthedResult, { ok: true }> | { ok: false; response: NextResponse }> {
  const auth = await getAuthedUserAlongside(request, async ({ user, claims }) => {
    // Nothing to look up for a session that cannot be an admin session.
    if (!hasAdminSessionClaims(user, claims)) return null;
    return withBackendDeadline(getServiceClient().auth.admin.getUserById(user.id));
  });
  if (!auth.ok) return auth;
  const { alongside, ...authed } = auth;
  const forbidden = {
    ok: false as const,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
  if ("error" in alongside) {
    console.error("[admin] live authorization check failed:", (alongside.error as Error)?.message);
    return forbidden;
  }
  const accountResult = alongside.value;
  if (!accountResult) return forbidden;
  if (accountResult.error) {
    console.error("[admin] live authorization check failed:", accountResult.error.message);
    return forbidden;
  }
  // The live session and MFA state were enforced by the shared lookup above,
  // which is the one `isAdminUser` would repeat.
  return isAdminAccount(authed.user, accountResult.data?.user) ? authed : forbidden;
}
