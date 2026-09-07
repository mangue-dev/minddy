import "server-only";

import type { User } from "@supabase/supabase-js";

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

/**
 * Revalidates every privileged request against the live Auth account and live
 * session. Access-token claims can remain cryptographically valid after role,
 * MFA, password, or session revocation, so no positive admin result is cached.
 */
export async function isAdminUser(
  user: Pick<User, "id"> | null | undefined,
  claims: Record<string, unknown> | null | undefined,
): Promise<boolean> {
  const sessionId = typeof claims?.session_id === "string" ? claims.session_id : "";
  if (
    !user?.id ||
    claims?.sub !== user.id ||
    claims?.aal !== "aal2" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId,
    )
  )
    return false;

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
    const account = accountResult.data?.user;
    const liveState = sessionResult.data;
    const hasVerifiedFactor = account?.factors?.some(
      (factor) => factor.status === "verified",
    );
    const bannedUntil = account?.banned_until
      ? Date.parse(account.banned_until)
      : Number.NaN;
    if (
      !liveState ||
      typeof liveState !== "object" ||
      Array.isArray(liveState) ||
      liveState.sessionActive !== true ||
      liveState.mfaAllowed !== true ||
      !account ||
      account.id !== user.id ||
      !hasMfaEnabled(account.app_metadata) ||
      !hasVerifiedFactor ||
      (Number.isFinite(bannedUntil) && bannedUntil > Date.now())
    )
      return false;
    if (hasAdminRole(account)) return true;
    return !!account.email_confirmed_at && isAdminEmail(account.email);
  } catch (error) {
    console.error("[admin] live authorization check failed:", (error as Error).message);
    return false;
  }
}
