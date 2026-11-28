import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ForgeWork } from "@/lib/forge-work-status";
import {
  forgeBranchUrl,
  forgeCommitUrl,
  type IssueBranch,
  type IssueCodeWork,
  type IssueCommit,
} from "@/lib/issue-code-work";
import { isRepoProviderId, type RepoProviderId } from "@/lib/repo-providers";
import { listPullRequestsForIssues } from "@/lib/server/agent/pull-requests";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeCodeWorkRow } from "./commit-content";
import { decodeRepositoryName } from "./repository-name-content";

/**
 * Reads of the commits and branches tracked for an issue (MIN-1037): what the
 * status resolver weighs, and what the issue panel lists.
 */

interface CommitRow {
  id: string;
  provider: string;
  external_repo_id: string;
  sha: string;
  title: string | null;
  author_name: string | null;
  author_login: string | null;
  author_avatar_url: string | null;
  committed_at: string | null;
  on_default_branch: boolean;
  closes: boolean;
  pull_request_id: string | null;
}

interface BranchRow {
  id: string;
  provider: string;
  external_repo_id: string;
  branch: string;
  pushed_at: string;
}

const COMMIT_COLUMNS =
  "id, provider, external_repo_id, sha, title, author_name, author_login, author_avatar_url, " +
  "committed_at, on_default_branch, closes, pull_request_id";
const BRANCH_COLUMNS = "id, provider, external_repo_id, branch, pushed_at";

/** The tracked branches of an issue, decoded. The caller has checked its access. */
export async function readIssueBranches(
  client: SupabaseClient,
  issueId: string,
): Promise<BranchRow[]> {
  const { data, error } = await client.from("issue_branches")
    .select(BRANCH_COLUMNS).eq("issue_id", issueId);
  if (error) throw new Error("Unable to read issue branches");
  return Promise.all(((data ?? []) as unknown as BranchRow[])
    .map((row) => decodeCodeWorkRow("issue_branches", row)));
}

/**
 * All the code work linked to an issue, for the status resolver. Read in
 * service key: the caller is a forge event or an authorized action.
 *
 * A branch that a linked pull request carries is that pull request's, so it
 * does not count as a pushed branch of its own.
 */
export async function readForgeWork(issueId: string): Promise<ForgeWork> {
  const service = getServiceClient();
  const [pullRequests, commits, branches] = await Promise.all([
    listPullRequestsForIssues([issueId]).then((byIssue) => byIssue.get(issueId) ?? []),
    service.from("issue_commits")
      .select("closes, on_default_branch, committed_at, pull_request_id")
      .eq("issue_id", issueId),
    readIssueBranches(service, issueId),
  ]);
  if (commits.error) throw new Error("Unable to read issue commits");
  const prBranches = new Set(pullRequests.map((pr) => pr.head_branch).filter(Boolean));
  return {
    pullRequests: pullRequests.map((pr) => ({
      state: pr.state, openedAt: pr.opened_at, mergedAt: pr.merged_at,
    })),
    commits: ((commits.data ?? []) as Array<{
      closes: boolean;
      on_default_branch: boolean;
      committed_at: string | null;
      pull_request_id: string | null;
    }>).map((commit) => ({
      closes: commit.closes,
      onDefaultBranch: commit.on_default_branch,
      committedAt: commit.committed_at,
      inPullRequest: !!commit.pull_request_id,
    })),
    branchPushed: branches.some((branch) => !prBranches.has(branch.branch)),
  };
}

/**
 * The commits and branches the issue panel lists, through the caller's own
 * client: row-level security on the issue decides what comes back.
 *
 * Only work that no pull request carries: a commit attached to a pull request
 * is shown there, and so is its branch. Links are built from the repository
 * the issue's project links today; work pushed to a repository that was since
 * unlinked keeps its line, without a link.
 */
export async function listIssueCodeWork(
  client: SupabaseClient,
  issue: { id: string; projectId: string },
): Promise<IssueCodeWork> {
  const [commitRead, branches, link, pullRequests] = await Promise.all([
    client.from("issue_commits").select(COMMIT_COLUMNS)
      .eq("issue_id", issue.id).is("pull_request_id", null)
      .order("committed_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false }).limit(200),
    readIssueBranches(client, issue.id),
    client.from("project_git_links").select("provider, external_repo_id, repo_full_name")
      .eq("project_id", issue.projectId).maybeSingle(),
    listPullRequestsForIssues([issue.id]).then((byIssue) => byIssue.get(issue.id) ?? []),
  ]);
  if (commitRead.error) throw new Error("Unable to read issue commits");
  const repo = link.data as {
    provider: string; external_repo_id: string; repo_full_name: string | null;
  } | null;
  const repoName = repo?.repo_full_name
    ? await decodeRepositoryName(repo.provider, repo.repo_full_name)
    : null;
  const nameFor = (provider: string, externalRepoId: string): string | null =>
    repo && repoName && repo.provider === provider && repo.external_repo_id === externalRepoId
      ? repoName
      : null;
  const providerOf = (provider: string): RepoProviderId =>
    isRepoProviderId(provider) ? provider : "github";

  const rows = await Promise.all(((commitRead.data ?? []) as unknown as CommitRow[])
    .map((row) => decodeCodeWorkRow("issue_commits", row)));
  const commits: IssueCommit[] = rows.map((row) => {
    const provider = providerOf(row.provider);
    const name = nameFor(row.provider, row.external_repo_id);
    return {
      sha: row.sha,
      title: row.title,
      authorLogin: row.author_login,
      authorName: row.author_name,
      authorAvatarUrl: row.author_avatar_url,
      committedAt: row.committed_at,
      url: name ? forgeCommitUrl(provider, name, row.sha) : null,
      onDefaultBranch: row.on_default_branch,
      closes: row.closes,
      provider,
    };
  });

  const prBranches = new Set(pullRequests.map((pr) => pr.head_branch).filter(Boolean));
  const seen = new Set<string>();
  const shown: IssueBranch[] = [];
  for (const row of [...branches].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at))) {
    const key = `${row.provider}\0${row.external_repo_id}\0${row.branch}`;
    if (prBranches.has(row.branch) || seen.has(key)) continue;
    seen.add(key);
    const provider = providerOf(row.provider);
    const name = nameFor(row.provider, row.external_repo_id);
    shown.push({
      name: row.branch,
      url: name ? forgeBranchUrl(provider, name, row.branch) : null,
      pushedAt: row.pushed_at,
      provider,
    });
  }
  return { commits, branches: shown };
}
