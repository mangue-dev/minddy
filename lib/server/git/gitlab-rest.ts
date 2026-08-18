import "server-only";

/**
 * Shared low-level REST plumbing for GitLab provider (MIN-47), scope
 * from AutoKap (gitlab-rest.ts) — minimized inert binding flow:
 * base URL, auth headers, pagination via header X-Next-Page.
 * gitlab.com SaaS only for v1.
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
 * GitLab pages with a `X-Next-Page` header (offset mode). Returns the next page number
 *, or null when exhausted.
 */
export function gitlabNextPage(response: Response): number | null {
  const next = response.headers.get("x-next-page");
  if (!next) return null;
  const n = Number(next);
  return Number.isFinite(n) && n > 0 ? n : null;
}
