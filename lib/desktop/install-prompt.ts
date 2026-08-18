/**
 * Who is offered to install the desktop app? (MIN-292)
 *
 * PUR module — no React, no `navigator` read softly: whatever decides
 * comes in as a parameter. This is what makes it possible to test the rule, including its painful cases
 * (the iPad which declares itself "MacIntel"), without mounting a DOM.
 *
 * **Three conditions, and each removes a population that would be driven away:**
 *
 * 1. **Not in the desktop app.** Offering to install it to someone who has it open is the definition of noise.
 * 2. **On a Mac.** There is no Windows or Linux version; offering it
 * elsewhere is promising what you don't have.
 * 3. **Not already ruled out.** The user said no once, and “once”
 * means forever.
 */

/**
 * The flag lives in `user_metadata`, like the other small preferences in the
 * account (`prompt_copy_auto_start`, `numo_default_status`) — and NOT in the
 * `localStorage`.
 *
 * This is what "never shown again" means: local storage le
 * would return to the first private browser, the first cache clean, and on
 * the second machine. Refusing a proposal is a decision of the person,
 * not of their browser.
 */
export const DESKTOP_PROMPT_DISMISSED_META_KEY = "desktop_prompt_dismissed";

/** Have we already ruled out the proposal? False by default. */
export function resolveDesktopPromptDismissed(
  meta: Record<string, unknown> | null | undefined
): boolean {
  return meta?.[DESKTOP_PROMPT_DISMISSED_META_KEY] === true;
}

/** What we read from the browser, and nothing more. */
export interface PlatformProbe {
  /** `navigator.userAgentData?.platform` — the only non-deprecated field. */
  uaDataPlatform?: string | null;
  /** `navigator.platform` — deprecated, but this is Safari's fallback. */
  platform?: string | null;
  userAgent?: string | null;
  /** `navigator.maxTouchPoints` — see iPad trap below. */
  maxTouchPoints?: number | null;
}

/**
 * Is it a Mac?
 *
 * ⚠ **The iPad lies.** Since iPadOS 13, in “site for computer” mode (the
 * default), it announces `MacIntel` and a Macintosh user agent: see it hold
 * there, we would offer a `.dmg` to a tablet. The only sign that separates them is
 * TOUCH — a Mac makes `maxTouchPoints` 0, an iPad 5. This is the test that
 * does Apple itself in its documentation, for lack of anything better.
 */
export function isMacPlatform(probe: PlatformProbe): boolean {
  const { uaDataPlatform, platform, userAgent, maxTouchPoints } = probe;

  // A touchscreen Mac does not exist: beyond a point of contact, it is an iPad
  // disguised. We cut before watching anything else.
  if ((maxTouchPoints ?? 0) > 1) return false;

  if (uaDataPlatform) return uaDataPlatform === "macOS";
  if (platform) return /^Mac/i.test(platform);
  return /Mac OS X|Macintosh/i.test(userAgent ?? "");
}

/** Faut-il proposer l'app de bureau ? */
export function shouldOfferDesktopApp(input: {
  /** Are we ALREADY running in the app? (presence of the bridge, cf. bridge.ts) */
  inDesktopApp: boolean;
  isMac: boolean;
  dismissed: boolean;
}): boolean {
  return !input.inDesktopApp && input.isMac && !input.dismissed;
}
