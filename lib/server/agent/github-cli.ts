import "server-only";

import type { RepoCloneTarget } from "./repo-access";

export const GITHUB_CLI_MAX_BYTES = 1_000_000;

export interface GithubCliResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Buffer a bounded response so neither relay can exhaust its process memory. */
export async function readGithubCliBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > GITHUB_CLI_MAX_BYTES) throw new Error("GitHub CLI response exceeds the relay limit");
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Resolve paths against a fixed API origin, never a caller-selected host. */
export function githubCliRequestUrl(repoFullName: string, path: unknown, method: unknown): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(String(method))) return null;
  const url = new URL(`https://api.github.com${path}`);
  if (url.hash || url.pathname !== path.split("?")[0]) return null;
  if (url.pathname === "/graphql") return method === "POST" ? url.href : null;
  const prefix = `/repos/${repoFullName}`;
  // Reject encoded path separators and traversal before checking the repository.
  const decoded = decodeURIComponent(url.pathname);
  if (decoded !== url.pathname || decoded.split("/").some((part) => part === ".." || part === ".")) return null;
  return url.pathname === prefix || url.pathname.startsWith(`${prefix}/`) ? url.href : null;
}

/** Authentication remains on the server; GraphQL uses a token scoped by repository ID. */
export async function relayGithubCliRequest(
  target: RepoCloneTarget,
  input: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
): Promise<GithubCliResponse> {
  let url: string | null = null;
  try { url = githubCliRequestUrl(target.repoFullName, input.path, input.method); } catch { /* Invalid URL or encoding. */ }
  if (target.provider !== "github" || !url) throw new Error("GitHub CLI request is outside the linked repository");
  const body = typeof input.body === "string" ? input.body : "";
  if (Buffer.byteLength(body) > GITHUB_CLI_MAX_BYTES) throw new Error("GitHub CLI request exceeds the relay limit");
  const response = await fetcher(url, {
    method: String(input.method),
    headers: {
      authorization: `Bearer ${target.token}`,
      accept: typeof input.accept === "string" && input.accept.length <= 256 ? input.accept : "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "Minddy-GitHub-CLI",
      "x-github-api-version": "2022-11-28",
    },
    ...(body && input.method !== "GET" ? { body } : {}),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const headers: Record<string, string> = {};
  for (const name of ["content-type", "link", "retry-after", "x-ratelimit-remaining", "x-ratelimit-reset"]) {
    const value = response.headers.get(name);
    if (value) headers[name] = value;
  }
  return { status: response.status, headers, body: await readGithubCliBody(response) };
}
