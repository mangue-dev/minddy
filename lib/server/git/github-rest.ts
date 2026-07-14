import "server-only";

/**
 * Plomberie REST bas niveau partagée pour l'intégration GitHub App (MIN-47),
 * portée d'AutoKap (github-rest.ts) — réduite au minimum dont le flux de liaison
 * inerte a besoin : base URL, en-têtes d'auth, pagination Link-header.
 */

export const GITHUB_API_BASE = "https://api.github.com";
export const GITHUB_API_VERSION = "2022-11-28";
export const USER_AGENT = "minddy-app";

export function githubHeaders(
  token: string,
  accept = "application/vnd.github+json",
): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": USER_AGENT,
  };
}

/** Extrait l'URL `rel="next"` d'un en-tête Link GitHub, ou null. */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}
