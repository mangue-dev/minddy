import "server-only";

/**
 * Plomberie REST bas niveau partagée pour le provider GitLab (MIN-47), portée
 * d'AutoKap (gitlab-rest.ts) — réduite au minimum du flux de liaison inerte :
 * base URL, en-têtes d'auth, pagination via l'en-tête X-Next-Page.
 * gitlab.com SaaS uniquement pour v1.
 */

export const GITLAB_HOST = "https://gitlab.com";
export const GITLAB_API_BASE = `${GITLAB_HOST}/api/v4`;
export const USER_AGENT = "minddy-app";

export function gitlabHeaders(
  token: string,
  accept = "application/json",
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "User-Agent": USER_AGENT,
  };
}

/**
 * GitLab pagine avec un en-tête `X-Next-Page` (mode offset). Renvoie le numéro
 * de page suivant, ou null quand épuisé.
 */
export function gitlabNextPage(response: Response): number | null {
  const next = response.headers.get("x-next-page");
  if (!next) return null;
  const n = Number(next);
  return Number.isFinite(n) && n > 0 ? n : null;
}
