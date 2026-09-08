import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import {
  DESKTOP_CALLBACK_FLAG,
  DESKTOP_PREVIEW_ORIGIN,
  DESKTOP_TURN_PARAM,
} from "@/lib/desktop/config";

/** Builds the OAuth return URL while keeping the desktop's PKCE exchange local. */
export function oauthCallbackUrl(
  origin: string,
  redirectAfter?: string,
  desktopTurn?: string,
): URL {
  // The hosted preview shares production Auth, whose redirect allowlist does
  // not include preview. Production can relay the code to the desktop without
  // reading browser cookies or consuming the desktop's PKCE verifier.
  // Keep this hosted relay explicit: self-hosted and local instances use their
  // own callbacks, and the web flow needs its verifier on the original origin.
  const callbackOrigin = desktopTurn && origin === DESKTOP_PREVIEW_ORIGIN
    ? "https://www.minddy.app"
    : origin;
  const callback = new URL("/auth/callback", callbackOrigin);
  const next = sanitizeInternalRedirectPath(redirectAfter);
  if (next !== "/home") callback.searchParams.set("next", next);
  if (desktopTurn) {
    callback.searchParams.set(DESKTOP_CALLBACK_FLAG, "1");
    callback.searchParams.set(DESKTOP_TURN_PARAM, desktopTurn);
  }
  return callback;
}
