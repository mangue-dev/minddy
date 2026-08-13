/**
 * Consentement aux cookies analytiques (MIN-77 / pages légales).
 *
 * Le choix vit dans le localStorage du navigateur, jamais côté serveur : c'est
 * une préférence d'appareil, pas une donnée de compte. Tant qu'aucun choix n'a
 * été fait, la valeur est `null` et AUCUN cookie analytique ne doit être posé.
 *
 * Ce contrat est honoré par `components/posthog-init.tsx` (MIN-78) : il lit
 * `readConsent()` à l'init (persistence "memory" tant que ce n'est pas
 * "accepted") et écoute CONSENT_CHANGED_EVENT pour réagir au clic du bandeau
 * sans rechargement. L'écouteur est posé au montage, AVANT le chargement du
 * client PostHog, et la relecture du consentement se fait après : un clic tombé
 * pendant le téléchargement est donc rattrapé (MIN-94).
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

/* ─── La copie qui SURVIT à l'appareil ─────────────────────────────────── */

/**
 * Le même choix, dans le compte (MIN-293).
 *
 * Le localStorage seul suffisait tant que la question se posait dans un
 * navigateur, qui garde son stockage pour toujours. **Dans l'app de bureau,
 * non** : la question s'y pose en modale bloquante au lancement, et le moindre
 * profil neuf — une réinstallation, une coquille de dév, une session repartie de
 * zéro — la reposait. Une question posée « une fois » qui revient à chaque
 * lancement n'est plus une question, c'est le bandeau qu'on remplaçait.
 *
 * D'où la copie dans `user_metadata`, écrite à côté du stockage local et jamais
 * à sa place. Le partage des rôles compte :
 *
 * - **le localStorage reste la source de vérité de la MESURE.** C'est lui que
 *   `posthog-init` lit, de façon synchrone, avant toute session ; le compte
 *   n'existe pas encore à ce moment-là, et attendre une session pour décider de
 *   poser un cookie serait le prendre à l'envers ;
 * - **le compte est la source de vérité de la QUESTION.** Un appareil sans choix
 *   local mais dont le compte en a un adopte celui du compte, sans redemander.
 *
 * Ce que ça ne change pas : un refus reste un refus partout, et l'accord d'un
 * appareil ne pose rien sur un autre tant qu'on ne s'y connecte pas.
 */
export const ANALYTICS_CONSENT_META_KEY = "analytics_consent";

/** Le choix porté par le compte, ou `null` s'il n'en porte pas. */
export function resolveAnalyticsConsent(meta: unknown): CookieConsent | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>)[ANALYTICS_CONSENT_META_KEY];
  return raw === "accepted" || raw === "declined" ? raw : null;
}
