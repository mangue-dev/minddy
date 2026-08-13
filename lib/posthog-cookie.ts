/**
 * Retrouver, depuis le SERVEUR, l'identité PostHog du navigateur (MIN-292).
 *
 * `/api/desktop/download` est une route publique : pas de session, donc pas
 * d'id de compte à donner à `captureServerEvent`. Sans rien, chaque
 * téléchargement partirait sous un id jeté, et l'événement ne se rattacherait à
 * aucun parcours — on saurait COMBIEN, jamais À LA SUITE DE QUOI.
 *
 * `posthog-js` écrit son `distinct_id` dans un cookie `ph_<clé>_posthog`, que le
 * navigateur joint à la requête comme à toutes les autres. Le lire ici suffit à
 * recoudre l'événement serveur au reste de la visite — la page vue, le clic sur
 * le bouton, l'inscription qui suit.
 *
 * **Ce cookie n'existe que si les cookies ont été ACCEPTÉS** : avant tout choix,
 * la persistance est en mémoire et rien n'est écrit sur l'appareil (voir
 * components/posthog-init.tsx). Le repli n'est donc pas un cas rare mais le cas
 * ordinaire, et il ne doit surtout pas inventer un identifiant stable : ce
 * serait poser côté serveur exactement le suivi que le navigateur s'est refusé
 * à poser. L'appelant tire un id jetable et coupe le profil de personne.
 *
 * Module PUR — il ne lit ni `process.env` ni les en-têtes : tout entre en
 * paramètre, et c'est ce qui le rend testable sans requête.
 */

/** Le nom du cookie de `posthog-js` pour une clé de projet donnée. */
export function posthogCookieName(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  return `ph_${apiKey}_posthog`;
}

/** Longueur au-delà de laquelle on refuse la valeur : un cookie forgé. */
const MAX_DISTINCT_ID_LENGTH = 200;

/**
 * Le `distinct_id` porté par la valeur du cookie, ou `null`.
 *
 * La valeur est du JSON, parfois encodé en URL selon qui l'a relue — d'où la
 * seconde tentative après `decodeURIComponent`. Tout ce qui n'est pas un JSON
 * portant une chaîne non vide rend `null` : c'est une donnée qui vient du
 * client, elle se vérifie.
 */
export function readPosthogDistinctId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parseJson(raw) ?? parseJson(safeDecode(raw));
  const id = (parsed as { distinct_id?: unknown } | null)?.distinct_id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > MAX_DISTINCT_ID_LENGTH) return null;
  return trimmed;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    // `decodeURIComponent` LÈVE sur un `%` isolé — fréquent dans un cookie
    // bricolé à la main. Une exception ici ferait tomber un téléchargement.
    return null;
  }
}
