/**
 * Consent to analytical cookies (MIN-77 / legal pages).
 *
 * The choice lives in the browser's localStorage, never on the server side: it's
 * a device preference, not an account data. As long as no choice has
 * been made, the value is `null` and NO analytical cookies should be set.
 *
 * This contract is honored by `components/posthog-init.tsx` (MIN-78): it reads
 * `readConsent()` at init ("memory" persistence as long as it is not
 * "accepted") and listens to CONSENT_CHANGED_EVENT to react to the click of the banner
 * without reloading. The listener is installed during assembly, BEFORE loading the PostHog client, and the consent is reread after: a click that falls during the download is therefore caught (MIN-94).
 */

export const COOKIE_CONSENT_KEY = "cookie_consent";
export const CONSENT_CHANGED_EVENT = "minddy:cookie-consent-changed";

export type CookieConsent = "accepted" | "declined";

/** The saved choice, or null if the user has not yet decided. */
export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    return raw === "accepted" || raw === "declined" ? raw : null;
  } catch {
    // localStorage unavailable (strict private browsing) → no consent.
    return null;
  }
}

/** Saves the choice and notifies the listeners (analytics) in the tab. */
export function writeConsent(consent: CookieConsent): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, consent);
  } catch {
    // Without storage, the banner will reappear: this is the safe behavior.
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

/* ─── The copy that SURVIVES the device ─────────────────────────────── */

/**
 * The same choice, in the account (MIN-293).
 *
 * The localStorage alone was enough as long as the question arose in a
 * browser, which keeps its storage forever. **In the desktop app,
 * no**: the question arises in blocking mode at launch, and the slightest
 * new profile — a reinstallation, a dev shell, a session restarted from
 * zero — rested it. A question asked "once" which comes back at each
 * launch is no longer a question, it is the banner that was replaced.
 *
 * Hence the copy in `user_metadata`, written next to the local storage and never
 * in its place. The sharing of roles counts:
 *
 * - **the localStorage remains the source of truth of the MEASUREMENT.** It is he that
 * `posthog-init` reads, synchronously, before any session; the account
 * does not yet exist at that moment, and waiting for a session to decide to
 * setting a cookie would be taking it in reverse;
 * - **the account is the source of truth of the QUESTION.** A device without a local choice
 * but whose account has one adopts that of the account, without ask again.
 *
 * What this doesn't change: a refusal remains a refusal everywhere, and the agreement of a
 * device does not pose anything to another as long as you do not connect to it.
 */
export const ANALYTICS_CONSENT_META_KEY = "analytics_consent";

/** The choice made by the account, or `null` if it does not have one. */
export function resolveAnalyticsConsent(meta: unknown): CookieConsent | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>)[ANALYTICS_CONSENT_META_KEY];
  return raw === "accepted" || raw === "declined" ? raw : null;
}
