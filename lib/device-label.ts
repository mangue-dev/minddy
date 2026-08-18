// The name given to a device subscribed to push notifications (MIN-183).
//
// A list of devices is useless if you don't recognize yours: it's
// exactly what we are doing there (“removing the old phone”).
// The endpoint, the only real identity of a subscription, is an opaque URL of 200
// characters — unreadable. Hence this wording, derived from the user-agent.
//
// It is calculated ON THE SERVER SIDE, from the `user-agent` header of the request
// subscription: nothing to believe in a request body, and a single place where the
// rule lives. Pure function, therefore testable.
//
// This is NOT browser detection in the functional sense: nothing
// depends on what it renders. It is a label read by a human, and its fallback
// (“This device”) is an acceptable result, not a failure.

/** The order counts: each family declares itself by pretending to be the previous
 *. Edge says “Chrome” and “Safari”, Chrome says “Safari”. */
const BROWSERS: readonly { name: string; test: RegExp }[] = [
  { name: "minddy", test: /\bminddy-desktop\//i },
  { name: "Edge", test: /\bEdg(?:e|A|iOS)?\//i },
  { name: "Opera", test: /\bOPR\/|\bOpera\//i },
  { name: "Samsung Internet", test: /\bSamsungBrowser\//i },
  { name: "Firefox", test: /\bFirefox\/|\bFxiOS\//i },
  { name: "Chrome", test: /\bChrome\/|\bCriOS\/|\bChromium\//i },
  { name: "Safari", test: /\bSafari\//i },
];

/** Same trap in the other direction: an Android also presents itself as “Linux”. */
const PLATFORMS: readonly { name: string; test: RegExp }[] = [
  { name: "iPhone", test: /\biPhone\b/i },
  { name: "iPad", test: /\biPad\b/i },
  { name: "Android", test: /\bAndroid\b/i },
  { name: "macOS", test: /\bMac OS X\b|\bMacintosh\b/i },
  { name: "Windows", test: /\bWindows\b/i },
  { name: "Linux", test: /\bLinux\b|\bX11\b/i },
];

/** What we display when the user-agent says nothing usable. Voluntarily
 * in English: the list of devices is translated, but this wording is
 * STORED, once, and the language of the subscription is not that of which the
 * will be read again six months later. The map replaces it with its own translation. */
export const UNKNOWN_DEVICE_LABEL = "Unknown device";

/**
 * “Chrome on macOS”, “Safari on iPhone” — or the fallback. The preposition is
 * in French in both languages, like anywhere minddy names a thing
 * stored: it's a label, not an interface phrase.
 */
export function deviceLabelFromUserAgent(ua: string | null | undefined): string {
  if (!ua || !ua.trim()) return UNKNOWN_DEVICE_LABEL;
  const browser = BROWSERS.find((b) => b.test.test(ua))?.name ?? null;
  const platform = PLATFORMS.find((p) => p.test.test(ua))?.name ?? null;
  if (browser && platform) return `${browser} sur ${platform}`;
  return browser ?? platform ?? UNKNOWN_DEVICE_LABEL;
}

/** True when the label designates a handheld device — the card puts a
 * phone icon there rather than a screen. Reads the label and not the user-agent:
 * this is all that remains stored on the client side. */
export function isMobileDeviceLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /\b(iPhone|iPad|Android)\b/i.test(label);
}
