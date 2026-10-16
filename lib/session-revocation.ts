import { BACKEND_REQUEST_TIMEOUT_MS, isBackendUnavailableError, SESSION_INVALID_CODE } from "./backend-availability";
import { getSupabase } from "./supabase";

/** After the API accepted a refreshed session, ignore later 401s for this long. */
export const UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS = 60_000;

let confirming: Promise<void> | null = null;
let confirmedLiveAt = Number.NEGATIVE_INFINITY;

/** True for the API's own session refusal, never a forge or relay credential. */
export function isSessionInvalidResponse(status: number, body: ArrayBuffer): boolean {
  if (status !== 401) return false;
  try {
    return (JSON.parse(new TextDecoder().decode(body)) as { code?: unknown } | null)?.code === SESSION_INVALID_CODE;
  } catch {
    return false;
  }
}

/**
 * A protected read was refused with `sessionInvalid` although this browser
 * still holds a session. The proxy and `getSession()` only read the cookie,
 * while the API also checks that the session is live, so an unusable session
 * kept the app open on endless 401s (MIN-691).
 *
 * One refresh settles most cases: a refused refresh means the session is gone.
 * The auth server and the API's live check can still disagree (a session past
 * the API's lifetime that the auth server keeps refreshing), so after a
 * successful refresh the refused read is tried once more. If the API still
 * refuses it, the session cannot be used and is dropped locally, which emits
 * `SIGNED_OUT` and lets the auth provider return to sign-in. An unreachable
 * auth server or API changes nothing.
 */
export function confirmSessionAfterUnauthorized(path: string): Promise<void> {
  if (Date.now() - confirmedLiveAt < UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS) return Promise.resolve();
  return confirming ??= (async () => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        if (isBackendUnavailableError(error)) return;
      } else {
        const probe = await fetch(path, { signal: AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS) });
        if (!isSessionInvalidResponse(probe.status, await probe.arrayBuffer())) {
          confirmedLiveAt = Date.now();
          return;
        }
      }
      // A local sign-out never touches the account's other devices.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    } catch {
      // A failed confirmation leaves the session as it was.
    } finally {
      confirming = null;
    }
  })();
}

/** Test seam: forget the cooldown between cases. */
export function resetUnauthorizedConfirmation(): void {
  confirming = null;
  confirmedLiveAt = Number.NEGATIVE_INFINITY;
}
