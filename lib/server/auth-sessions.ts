import "server-only";

import { BACKEND_REQUEST_TIMEOUT_MS } from "@/lib/backend-availability";
import { deviceFromUserAgent } from "@/lib/device-label";
import { getServiceClient } from "@/lib/supabase-service";
import type { AuthSessionSummary } from "@/lib/types";

type SessionRow = {
  id: string;
  created_at: string;
  last_active_at: string;
  user_agent: string | null;
};

/**
 * The live sessions of an account, most recently used first.
 *
 * `public.list_auth_sessions` applies the same liveness rule as the API guard,
 * so a listed session is one the API still accepts. The caller must already
 * have verified `userId` and `currentSessionId` from the request's claims.
 */
export async function listAuthSessions(
  userId: string,
  currentSessionId: string,
): Promise<AuthSessionSummary[]> {
  const { data, error } = await getServiceClient()
    .rpc("list_auth_sessions", { p_user: userId })
    .abortSignal(AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS));
  if (error) throw new Error("auth_sessions_lookup_failed");
  return ((data ?? []) as SessionRow[]).map((row) => ({
    id: row.id,
    current: row.id === currentSessionId,
    ...deviceFromUserAgent(row.user_agent),
    created_at: row.created_at,
    last_active_at: row.last_active_at,
  }));
}

/**
 * Ends one other session of the account. Returns `false` when the session is
 * the caller's own, belongs to someone else, or no longer exists: the caller
 * cannot tell these apart, so another account's session ids reveal nothing.
 */
export async function revokeAuthSession(
  userId: string,
  sessionId: string,
  currentSessionId: string,
): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .rpc("revoke_auth_session", {
      p_user: userId,
      p_session: sessionId,
      p_current_session: currentSessionId,
    })
    .abortSignal(AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS));
  if (error) throw new Error("auth_session_revoke_failed");
  return data === true;
}
