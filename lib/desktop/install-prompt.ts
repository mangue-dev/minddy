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
 * 2. **On a supported desktop platform.** macOS and Linux users can install
 * the app; unsupported platforms must not receive a broken download promise.
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

/** The immutable Partner Center product link for the minddy Store listing. */
export const WINDOWS_STORE_DEEP_LINK =
  "ms-windows-store://pdp/?ProductId=9P181CDLRFBC";

export type InstallPlatform =
  | "macos"
  | "windows"
  | "linux"
  | "ios"
  | "android"
  | "unsupported";

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

  if (/\b(?:iPhone|iPad|iPod)\b/i.test(userAgent ?? "")) return false;

  // A touchscreen Mac does not exist: beyond a point of contact, it is an iPad
  // disguised. We cut before watching anything else.
  if ((maxTouchPoints ?? 0) > 1) return false;

  if (uaDataPlatform) return uaDataPlatform === "macOS";
  if (platform) return /^Mac/i.test(platform);
  return /Mac OS X|Macintosh/i.test(userAgent ?? "");
}

/** Is the browser running on iPhone or iPad, including iPad's Mac disguise? */
export function isIosPlatform(probe: PlatformProbe): boolean {
  const { uaDataPlatform, platform, userAgent, maxTouchPoints } = probe;

  if (uaDataPlatform === "iOS") return true;
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(userAgent ?? "")) return true;
  return /^Mac/i.test(platform ?? "") && (maxTouchPoints ?? 0) > 1;
}

/** Is the browser running on Android rather than desktop Linux? */
export function isAndroidPlatform(probe: PlatformProbe): boolean {
  const { uaDataPlatform, userAgent } = probe;

  if (/\bAndroid\b/i.test(userAgent ?? "")) return true;
  return uaDataPlatform === "Android";
}

/** Is the browser running on a Linux desktop platform? */
export function isLinuxPlatform(probe: PlatformProbe): boolean {
  const { uaDataPlatform, platform, userAgent } = probe;

  if (/\bAndroid\b/i.test(userAgent ?? "")) return false;
  if (uaDataPlatform) return uaDataPlatform === "Linux";
  if (platform) return /^Linux/i.test(platform);
  return /\bLinux\b/i.test(userAgent ?? "");
}

/** Is the browser running on Windows? */
export function isWindowsPlatform(probe: PlatformProbe): boolean {
  const { uaDataPlatform, platform, userAgent } = probe;

  if (uaDataPlatform) return uaDataPlatform === "Windows";
  if (platform) return /^Win/i.test(platform);
  return /\bWindows\b/i.test(userAgent ?? "");
}

/** Resolve the install path that matches the current browser platform. */
export function resolveInstallPlatform(probe: PlatformProbe): InstallPlatform {
  if (isIosPlatform(probe)) return "ios";
  if (isAndroidPlatform(probe)) return "android";
  if (isMacPlatform(probe)) return "macos";
  if (isWindowsPlatform(probe)) return "windows";
  if (isLinuxPlatform(probe)) return "linux";
  return "unsupported";
}

/** Should the signed desktop application be offered from the browser? */
export function shouldOfferDesktopApp(input: {
  /** Are we ALREADY running in the app? (presence of the bridge, cf. bridge.ts) */
  inDesktopApp: boolean;
  isMac: boolean;
  isLinux?: boolean;
  dismissed: boolean;
}): boolean {
  return !input.inDesktopApp && (input.isMac || Boolean(input.isLinux)) && !input.dismissed;
}
