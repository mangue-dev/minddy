import { isBackendUnavailableError } from "./backend-availability";
import { getSupabase } from "./supabase";

/** After a 401 that a live refresh contradicted, ignore later 401s for this long. */
export const UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS = 60_000;

let confirming: Promise<void> | null = null;
let confirmedLiveAt = Number.NEGATIVE_INFINITY;

/**
 * A protected read was refused with 401 although this browser still holds a
 * session. The proxy and `getSession()` only read the cookie, while the API
 * also checks that the session is still live, so a revoked or timed-out
 * session kept the app open on endless 401s (MIN-691).
 *
 * GoTrue applies the same session rules as the API, so one refresh settles it:
 * a refused refresh means the session is gone and the local copy is dropped,
 * which emits `SIGNED_OUT` and lets the auth provider return to sign-in.
 * A successful or unreachable refresh changes nothing.
 */
export function confirmSessionAfterUnauthorized(): Promise<void> {
  if (Date.now() - confirmedLiveAt < UNAUTHORIZED_CONFIRMATION_COOLDOWN_MS) return Promise.resolve();
  return confirming ??= (async () => {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.refreshSession();
      if (!error) {
        confirmedLiveAt = Date.now();
        return;
      }
      if (isBackendUnavailableError(error)) return;
      // supabase-js usually removes the session itself after a refused refresh;
      // a local sign-out makes that explicit and never touches other devices.
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
