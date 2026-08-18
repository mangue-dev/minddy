/**
 * The only authentication path for the desktop app (MIN-291).
 *
 * ## Why there is
 *
 * Google **refuses OAuth from an embedded browser**, and a magic link
 * received by email opens from anyway in the DEFAULT browser, never
 * in our window. Two constraints, only one outcome: the trick is done in
 * the system browser, and the result returns to the app via a deep link
 * `minddy://auth?…`.
 *
 * ## The two halves, and why they are in the same file
 *
 * `desktopAuthLinkFromCallback` is read by the SERVER (app/auth/callback), which
 * makes the link; `parseDesktopAuthLink` is read by the MAIN PROCESS, which
 * receives. It is a contract between two processes, of the same type as the
 * i18n contract between two catalogs: rereading them separately does not verify it. Written
 * side by side, they test each other back and forth (auth-link.test.ts).
 *
 * ## What the server DOES NOT do on this path
 *
 * Neither `exchangeCodeForSession` nor `verifyOtp`, nor the slightest cookie. The
 * PKCE checker lives in the storage of the app, which started the round; the
 * server could not redeem the code even if it wanted to. It transmits, and
 * that's all. The `token_hash` of an email link is transmitted INTACT for the same
 * reason — it remains for single use, simply it is the app that uses it.
 *
 * ## What a READABLE link does not prove (MIN-345)
 *
 * `parseDesktopAuthLink` answers “is this exploitable?” ", never to "is this
 * legit?" ". macOS delivers to the app EVERYTHING that carries our schema, wherever it
 * comes from: a `minddy://auth?code=…` received from the system is a perfectly
 * readable link, and connects the window to the account of which had sent it.
 *
 * Hence the `turn`: a nonce that the app draws at the START of its turn
 * (lib/desktop/auth-turn.ts), which it slips into the `redirectTo`, which crosses
 * the provider and returns here. The window compares it to the one it kept —
 * it is `components/desktop-auth-bridge.tsx` which decides, not this module.
 *
 * An MAIL link will never carry one: the GoTrue template composes the URL
 * itself, and the email can very be opened on a device other than
 * the one that requested the account. This is confirmed by hand, in the
 * window.
 */

import type { EmailOtpType } from "@supabase/supabase-js";
import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import {
  DESKTOP_AUTH_HOST,
  DESKTOP_PROTOCOL,
  DESKTOP_TURN_PARAM,
} from "@/lib/desktop/config";

/** The types of OTP that an email link can carry (same values ​​as GoTrue). */
const EMAIL_OTP_TYPES: ReadonlySet<string> = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export function parseOtpType(value: string | null): EmailOtpType | null {
  return value && EMAIL_OTP_TYPES.has(value)
    ? (value as EmailOtpType)
    : null;
}

/**
 * What an authentication deep link carries. Three shapes, just one
 * entry into the app — that's the point.
 */
export type DesktopAuthLink =
  /** `turn` = the nonce of the tour, when the app has started one (MIN-345). Absent
 * of a link received from the system that we did not provoke — that is its entire purpose. */
  | { kind: "code"; code: string; next: string; turn?: string }
  | { kind: "otp"; tokenHash: string; type: EmailOtpType; next: string; turn?: string }
  /** The provider or GoTrue refused. The same pairs `error`/`reason` as the
 * web redirection to `/login`, so that the app displays the same sentences. */
  | { kind: "error"; error: string; reason: string };

/** `minddy://auth?…` — the URL that the system browser opens to wake the app. */
export function buildDesktopAuthUrl(link: DesktopAuthLink): string {
  const params = new URLSearchParams();
  if (link.kind === "code") {
    params.set("code", link.code);
    if (link.next !== "/home") params.set("next", link.next);
    if (link.turn) params.set(DESKTOP_TURN_PARAM, link.turn);
  } else if (link.kind === "otp") {
    params.set("token_hash", link.tokenHash);
    params.set("type", link.type);
    if (link.next !== "/home") params.set("next", link.next);
    if (link.turn) params.set(DESKTOP_TURN_PARAM, link.turn);
  } else {
    params.set("error", link.error);
    params.set("reason", link.reason);
  }
  return `${DESKTOP_PROTOCOL}://${DESKTOP_AUTH_HOST}?${params.toString()}`;
}

/**
 * What `/auth/callback` should return to the app, from its query.
 *
 * The order is that of the web handler: a refusal from the provider first (it bounces
 * with `error` and never from `code`), then the OAuth code, then the OTP of a
 * mail link. None of that = `missing_params`, and the app will say it instead of waiting.
 */
export function desktopAuthLinkFromCallback(
  params: URLSearchParams
): DesktopAuthLink {
  const providerError = params.get("error");
  if (providerError) {
    return {
      kind: "error",
      error: providerError === "access_denied" ? "oauth_denied" : "oauth_failed",
      reason: providerError,
    };
  }

  const next = sanitizeInternalRedirectPath(params.get("next"));
  // The nonce of the tour makes the round trip via the provider: he was in the
  // `redirectTo` that the app has composed, it goes back to the deep link (MIN-345).
  const turn = params.get(DESKTOP_TURN_PARAM) ?? undefined;
  const code = params.get("code");
  if (code) return { kind: "code", code, next, turn };

  const tokenHash = params.get("token_hash");
  const type = parseOtpType(params.get("type"));
  if (tokenHash && type) return { kind: "otp", tokenHash, type, next, turn };

  return { kind: "error", error: "auth_callback_failed", reason: "missing_params" };
}

/**
 * Reads a deep link received by the system. Makes `null` for everything that is not
 * an exploitable `minddy://auth` — macOS delivers to the app EVERYTHING that carries our
 * pattern, including what we have never issued.
 */
export function parseDesktopAuthLink(raw: string): DesktopAuthLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DESKTOP_PROTOCOL}:`) return null;
  // `minddy://auth?x=1` parses the host into `auth`; `minddy:auth?x=1` stores it in
  // the path. The two forms circulate depending on who composes the URL, we accept the
  // two rather than losing a connection on a slash.
  const host = url.hostname || url.pathname.replace(/^\/*/, "");
  if (host !== DESKTOP_AUTH_HOST) return null;

  const params = url.searchParams;
  const error = params.get("error");
  if (error) {
    return { kind: "error", error, reason: params.get("reason") ?? error };
  }

  const next = sanitizeInternalRedirectPath(params.get("next"));
  const turn = params.get(DESKTOP_TURN_PARAM) ?? undefined;
  const code = params.get("code");
  if (code) return { kind: "code", code, next, turn };

  const tokenHash = params.get("token_hash");
  const type = parseOtpType(params.get("type"));
  if (tokenHash && type) return { kind: "otp", tokenHash, type, next, turn };

  return null;
}
