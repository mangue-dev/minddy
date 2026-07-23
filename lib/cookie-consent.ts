/**
 * Consentement aux cookies analytiques (MIN-77 / pages légales).
 *
 * Le choix vit dans le localStorage du navigateur, jamais côté serveur : c'est
 * une préférence d'appareil, pas une donnée de compte. Tant qu'aucun choix n'a
 * été fait, la valeur est `null` et AUCUN cookie analytique ne doit être posé.
 *
 * PostHog n'est pas encore branché : quand il le sera, son provider doit lire
 * `readConsent()` à l'init (persistence "memory" tant que ce n'est pas
 * "accepted") et écouter CONSENT_CHANGED_EVENT pour réagir au clic du bandeau
 * sans rechargement.
 */

export const COOKIE_CONSENT_KEY = "cookie_consent";
export const CONSENT_CHANGED_EVENT = "minddy:cookie-consent-changed";

export type CookieConsent = "accepted" | "declined";

/** Le choix enregistré, ou null si l'utilisateur n'a pas encore tranché. */
export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    return raw === "accepted" || raw === "declined" ? raw : null;
  } catch {
    // localStorage indisponible (navigation privée stricte) → pas de consentement.
    return null;
  }
}

/** Enregistre le choix et prévient les écouteurs (analytics) dans l'onglet. */
export function writeConsent(consent: CookieConsent): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, consent);
  } catch {
    // Sans stockage, le bandeau réapparaîtra : c'est le comportement sûr.
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}
