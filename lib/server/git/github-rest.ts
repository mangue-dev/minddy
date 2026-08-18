import "server-only";

/**
 * Shared low-level REST plumbing for GitHub App integration (MIN-47),
 * AutoKap scope (github-rest.ts) — reduced to the minimum that binding flow
 * inert needs: base URL, auth headers, pagination Link-header.
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

/** Extracts the `rel="next"` URL from a GitHub Link header, or null. */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}
