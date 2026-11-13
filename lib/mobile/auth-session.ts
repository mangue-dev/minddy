/**
 * OAuth in the native mobile app (MIN-907).
 *
 * Google refuses OAuth inside an embedded WebView (`disallowed_useragent`), so
 * the shell runs the provider's pages in an `ASWebAuthenticationSession`: the
 * system's own sign-in sheet, which shares Safari's cookies and closes by
 * itself. The round trip is the desktop app's (lib/desktop/auth-link.ts): the
 * `redirectTo` carries the `desktop` flag and a turn nonce, `/auth/callback`
 * turns the code into `minddy://auth?code=…&turn=…` without consuming it, and
 * the session catches that URL and hands it back to the page. The PKCE
 * verifier never left the WebView's storage, so only the page can exchange
 * the code.
 *
 * Unlike the desktop app, nothing registers the `minddy` scheme with the
 * system: the session catches it before any app could. A link from elsewhere
 * cannot reach this path, and the turn is still checked, as on the desktop.
 */

import { DESKTOP_PROTOCOL } from "@/lib/desktop/config";
import { parseDesktopAuthLink, type DesktopAuthLink } from "@/lib/desktop/auth-link";
import { clearDesktopAuthTurn, consumeDesktopAuthTurn } from "@/lib/desktop/auth-turn";
import type { MobileShellPlugin } from "@/lib/mobile/bridge";

export type MobileAuthShell = Required<Pick<MobileShellPlugin, "authenticate">>;

export type MobileAuthOutcome =
  /** The person closed the sheet. */
  | { kind: "cancelled" }
  /** The callback's answer: a code to exchange, or the provider's refusal. */
  | { kind: "link"; link: DesktopAuthLink };

/** The shell that can run a native sign-in session, or null. */
export function mobileAuthShell(shell: MobileShellPlugin | null | undefined): MobileAuthShell | null {
  return shell && typeof shell.authenticate === "function" ? (shell as MobileAuthShell) : null;
}

/**
 * Opens `url` (the provider's authorization URL) in the native sign-in sheet
 * and reads what `/auth/callback` sent back. Throws when the answer is not
 * the one this turn expects.
 */
export async function runMobileAuthSession(
  shell: MobileAuthShell,
  url: string,
): Promise<MobileAuthOutcome> {
  let callback: string | undefined;
  try {
    ({ url: callback } = await shell.authenticate({ url, callbackScheme: DESKTOP_PROTOCOL }));
  } catch (error) {
    clearDesktopAuthTurn();
    throw error;
  }
  if (!callback) {
    clearDesktopAuthTurn();
    return { kind: "cancelled" };
  }
  const link = parseDesktopAuthLink(callback);
  if (!link || link.kind === "otp") {
    clearDesktopAuthTurn();
    throw new Error("auth_callback_failed");
  }
  if (link.kind === "error") {
    clearDesktopAuthTurn();
    return { kind: "link", link };
  }
  if (!consumeDesktopAuthTurn(link.turn)) throw new Error("auth_callback_failed");
  return { kind: "link", link };
}
