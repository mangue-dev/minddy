import "server-only";

import type { NextRequest } from "next/server";
import { createSupabaseWithCookieSink, type CookieSink } from "@/lib/server/api-auth";

/**
 * Which returns from a forge callback (MIN-324).
 *
 * The `state` signed by [link-state.ts](./link-state.ts) says **where we are going** — what
 * project, what return. He doesn't say **who's coming back**. The HMAC signature prevents
 * from MAKING one; it does not prevent you from REUSING a legitimate one, and that's
 * all the difference:
 *
 * - `/api/git/github/setup` had no session to confront: an ordinary user
 * mined his own `state`, listed `installation_id` (small
 * sequential integers) and reallocated the installations of others;
 * - the two OAuth callbacks saved the token under `state.userId`: a
 * link sent to a victim deposited the VICTIM's token in the account from
 * the attacker.
 *
 * Only the session says who returns. Hence this module, shared by the three routes.
 *
 * ## The cookie trap (MIN-293)
 *
 * These callbacks are first-level navigations from the forge, and the
 * proxy matcher excludes `/api/`: the handler is therefore the FIRST to open the
 * session cookies, with an access token which may be expired. Reading the
* renews, GoTrue rotates the refresh token, and discarding the
* couple new LOGS OUT the user. Hence `createSupabaseWithCookieSink` — and
 * the requirement to pass **every** output through `applyCookies`, including
 * error redirects. Especially not `getAuthedUser`: it returns a 401 JSON (a
 * navigation awaits a redirect) and reads with an empty `setAll`.
 */
export interface ForgeCallbackSession {
  /** The user logged in IN THIS TAB, or null. */
  userId: string | null;
  applyCookies: CookieSink["applyCookies"];
}

export async function readForgeCallbackSession(
  request: NextRequest,
): Promise<ForgeCallbackSession> {
  const { supabase, applyCookies } = createSupabaseWithCookieSink(request);
  try {
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return { userId: typeof sub === "string" && sub ? sub : null, applyCookies };
  } catch {
    // Supabase unreachable: we don't know who is coming back, so we don't write anything.
    // Fail closed — the worst thing here would be to grant by default.
    return { userId: null, applyCookies };
  }
}

/**
 * Do the `state` and the session designate the same person?
 *
 * An absence of session authorizes NOTHING: two `null` do not “match”,
 * they only note that we do not know who returns.
 */
export function sessionMatchesState(
  sessionUserId: string | null | undefined,
  stateUserId: string | null | undefined,
): boolean {
  if (!sessionUserId || !stateUserId) return false;
  return sessionUserId === stateUserId;
}
