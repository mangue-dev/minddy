import { fetchClientRead } from "./client-read";
import type { PromptPullRequest, PromptRepository } from "./issue-prompt";

/**
 * Forge context the copied issue prompts carry (MIN-719): linked pull
 * requests and the project's repository, read from minddy when the user
 * copies — no forge call, no paid generation.
 *
 * Copying must stay instant and must never fail because of it, so the read
 * is bounded and every failure degrades to "unavailable" (`pullRequests:
 * null`), which the prompt states instead of claiming there is no pull
 * request.
 */
export interface IssuePromptForgeContext {
  pullRequests: PromptPullRequest[] | null;
  repository: PromptRepository | null;
}

export const PROMPT_CONTEXT_TIMEOUT_MS = 2500;
const MAX_ISSUES = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const UNAVAILABLE_FORGE_CONTEXT: IssuePromptForgeContext = {
  pullRequests: null,
  repository: null,
};

/** Forge context per issue id; an issue missing from the map is unavailable. */
export async function loadIssuePromptContext(
  issueIds: readonly string[],
): Promise<Map<string, IssuePromptForgeContext>> {
  // Optimistic issues carry temporary ids the server has never seen.
  const ids = [...new Set(issueIds)].filter((id) => UUID.test(id)).slice(0, MAX_ISSUES);
  if (ids.length === 0) return new Map();
  try {
    const response = await fetchClientRead(
      `/api/issues/prompt-context?ids=${ids.join(",")}`,
      { cache: "no-store" },
      { timeoutMs: PROMPT_CONTEXT_TIMEOUT_MS },
    );
    if (!response.ok) return new Map();
    const body = (await response.json()) as {
      issues?: Record<string, IssuePromptForgeContext>;
    };
    return new Map(Object.entries(body.issues ?? {}));
  } catch {
    return new Map();
  }
}

/** Forge context of ONE issue, unavailable on any failure. */
export async function loadOneIssuePromptContext(
  issueId: string,
): Promise<IssuePromptForgeContext> {
  return (await loadIssuePromptContext([issueId])).get(issueId) ?? UNAVAILABLE_FORGE_CONTEXT;
}
