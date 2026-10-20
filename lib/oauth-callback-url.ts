import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { DESKTOP_CALLBACK_FLAG, DESKTOP_TURN_PARAM } from "@/lib/desktop/config";

/** Builds the OAuth return URL while keeping the desktop's PKCE exchange local. */
export function oauthCallbackUrl(
  origin: string,
  redirectAfter?: string,
  desktopTurn?: string,
): URL {
  // Every instance, the hosted preview included, returns to its own callback:
  // preview has its own Auth project, whose redirect allowlist names it. The
  // desktop flag only tells the callback to relay the code to the shell.
  const callback = new URL("/auth/callback", origin);
  const next = sanitizeInternalRedirectPath(redirectAfter);
  if (next !== "/home") callback.searchParams.set("next", next);
  if (desktopTurn) {
    callback.searchParams.set(DESKTOP_CALLBACK_FLAG, "1");
    callback.searchParams.set(DESKTOP_TURN_PARAM, desktopTurn);
  }
  return callback;
}
