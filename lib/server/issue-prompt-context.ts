import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listPullRequestsForIssues } from "@/lib/server/agent/pull-requests";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { issueStore } from "@/lib/server/issue-store";
import type { PromptPullRequest, PromptRepository } from "@/lib/issue-prompt";

/** Forge context of one issue, as the copied prompts render it (MIN-719). */
export interface IssuePromptForgeContext {
  /** Every linked pull request, most recently updated first; `[]` = none. */
  pullRequests: PromptPullRequest[];
  /** The project's linked repository, or null when the project links none. */
  repository: PromptRepository | null;
}

export const MAX_PROMPT_CONTEXT_ISSUES = 50;

/**
 * Pull requests and repository of the issues the CALLER can see. Visibility
 * is decided by the caller's own client (RLS); the forge rows are then read
 * and decoded with the service key, exactly as the issue panel's
 * `findPullRequestForIssue` contract does. An issue the caller cannot see is
 * simply absent from the result.
 */
export async function readIssuePromptContext(
  client: SupabaseClient,
  issueIds: readonly string[],
  actorId: string | null = null,
): Promise<Record<string, IssuePromptForgeContext>> {
  const ids = [...new Set(issueIds)].slice(0, MAX_PROMPT_CONTEXT_ISSUES);
  if (ids.length === 0) return {};
  const { data, error } = await issueStore(client, actorId)
    .select("id, project_id")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw new Error("Unable to read issues");
  const visible = (data ?? []) as Array<{ id: string; project_id: string }>;
  if (visible.length === 0) return {};

  const projectIds = [...new Set(visible.map((issue) => issue.project_id))];
  const [pullRequests, links] = await Promise.all([
    listPullRequestsForIssues(visible.map((issue) => issue.id)),
    Promise.all(projectIds.map(async (projectId) =>
      [projectId, await getProjectLink(projectId)] as const)),
  ]);
  const repositories = new Map(links.map(([projectId, link]) => [
    projectId,
    link?.repo_full_name
      ? {
          provider: link.provider,
          fullName: link.repo_full_name,
          defaultBranch: link.default_branch,
        }
      : null,
  ]));

  return Object.fromEntries(visible.map((issue) => [issue.id, {
    pullRequests: (pullRequests.get(issue.id) ?? []).map((pr) => ({
      number: pr.number,
      state: pr.state,
      url: pr.url,
      headBranch: pr.head_branch,
      baseBranch: pr.base_branch,
    })),
    repository: repositories.get(issue.project_id) ?? null,
  }]));
}
