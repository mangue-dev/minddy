import { isMobileAppUserAgent } from "@/lib/mobile/app-request";

/**
 * Consent to the AI features in the mobile app (MIN-907, App Store guideline
 * 5.1.2(i)).
 *
 * Numo, Smart Fill, dictation and semantic search send what they work on to
 * the provider of the AI model in use, which the administration sets. Apple asks an app to say so
 * and to get the person's permission before the first such request. The app
 * asks once on each device, in `components/mobile/ai-consent-gate.tsx`, and
 * keeps the answer in a cookie of its WebView so the server reads it on every
 * request. Until the answer is "granted", the server refuses the AI work a
 * request from the app would start (`lib/server/ai-consent.ts`). The web and
 * the desktop app do not ask.
 *
 * Signing out clears the cookie, so the next account on the phone is asked
 * again. Each answer is also written to the account (`AI_CONSENT_META_KEY`),
 * which the background jobs read.
 */

export const AI_CONSENT_COOKIE = "minddy-ai-consent";
/**
 * The same answer kept on the account (`user_metadata`), for the work that
 * runs without a request from the app: the cron jobs skip AI for an account
 * whose last answer was "declined", and run it when the answer is "granted"
 * or was never given.
 */
export const AI_CONSENT_META_KEY = "ai_consent";

/** Error code and response header of a request refused for want of consent. */
export const AI_CONSENT_REQUIRED_CODE = "ai_consent_required";
export const AI_CONSENT_HEADER = "x-minddy-ai-consent";

/** Sent on `window` when the app should ask for consent again. */
export const AI_CONSENT_REQUEST_EVENT = "minddy:ai-consent-request";
/** Sent on `window` when the answer kept on this device changes. */
export const AI_CONSENT_CHANGE_EVENT = "minddy:ai-consent-change";

export type AiConsent = "granted" | "declined";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function parseAiConsent(value: string | null | undefined): AiConsent | null {
  return value === "granted" || value === "declined" ? value : null;
}

/** Whether a request comes from the mobile app without consent to AI. */
export function aiConsentMissing(
  userAgent: string | null | undefined,
  cookieValue: string | null | undefined,
): boolean {
  return isMobileAppUserAgent(userAgent) && parseAiConsent(cookieValue) !== "granted";
}

/** The answer kept on this device, or `null` when the person was not asked. */
export function readAiConsent(cookies: string = typeof document === "undefined" ? "" : document.cookie): AiConsent | null {
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === AI_CONSENT_COOKIE) return parseAiConsent(decodeURIComponent(rest.join("=")));
  }
  return null;
}

export function writeAiConsent(value: AiConsent): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AI_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(AI_CONSENT_CHANGE_EVENT));
}

export function clearAiConsent(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AI_CONSENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  window.dispatchEvent(new Event(AI_CONSENT_CHANGE_EVENT));
}

/** Whether a response is the server's refusal for want of consent. */
export function isAiConsentRefusal(response: Response): boolean {
  return response.status === 403 && response.headers.get(AI_CONSENT_HEADER) === "required";
}

/**
 * Makes every refusal for want of consent ask again, whichever surface sent
 * the request: Numo, a dictation, the home brief. Returns what restores
 * `fetch`.
 */
export function installAiConsentFetchGuard(target: Window = window): () => void {
  const original = target.fetch;
  const guarded: typeof fetch = async (input, init) => {
    const response = await original.call(target, input, init);
    if (isAiConsentRefusal(response)) target.dispatchEvent(new Event(AI_CONSENT_REQUEST_EVENT));
    return response;
  };
  target.fetch = guarded;
  return () => {
    if (target.fetch === guarded) target.fetch = original;
  };
}
