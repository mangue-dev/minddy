import type { RepoProviderId } from "./repo-providers";

/**
 * The code work an issue shows next to its pull request (MIN-1037): commits
 * pushed without one, and the branches named after the issue. Shared by the
 * route that serves them and the panel that lists them.
 */

export interface IssueCommit {
  sha: string;
  /** First line of the commit message. */
  title: string | null;
  authorLogin: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  /** Page of the commit on the forge, or null when its repository is no longer linked. */
  url: string | null;
  onDefaultBranch: boolean;
  /** The commit completes the issue (`Fixes MIN-42`). */
  closes: boolean;
  provider: RepoProviderId;
}

export interface IssueBranch {
  name: string;
  url: string | null;
  pushedAt: string;
  provider: RepoProviderId;
}

export interface IssueCodeWork {
  commits: IssueCommit[];
  branches: IssueBranch[];
}

export const EMPTY_ISSUE_CODE_WORK: IssueCodeWork = { commits: [], branches: [] };

const WEB_HOSTS: Record<RepoProviderId, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
};

function repoPath(repoFullName: string): string {
  return repoFullName.split("/").map(encodeURIComponent).join("/");
}

/** Page of a commit on its forge. */
export function forgeCommitUrl(
  provider: RepoProviderId,
  repoFullName: string,
  sha: string,
): string {
  const base = `${WEB_HOSTS[provider]}/${repoPath(repoFullName)}`;
  return provider === "gitlab"
    ? `${base}/-/commit/${encodeURIComponent(sha)}`
    : `${base}/commit/${encodeURIComponent(sha)}`;
}

/** Page of a branch on its forge. */
export function forgeBranchUrl(
  provider: RepoProviderId,
  repoFullName: string,
  branch: string,
): string {
  const base = `${WEB_HOSTS[provider]}/${repoPath(repoFullName)}`;
  // A branch name keeps its slashes in the path on both forges.
  const path = branch.split("/").map(encodeURIComponent).join("/");
  return provider === "gitlab" ? `${base}/-/tree/${path}` : `${base}/tree/${path}`;
}

/** The seven characters a forge shows for a commit. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}
