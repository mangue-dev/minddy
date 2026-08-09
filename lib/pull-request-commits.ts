import type { PullRequestCommit } from "@/lib/agent-api";

/** The forge returns commits oldest first; the UI presents the newest first. */
export function newestFirstPullRequestCommits(
  commits: PullRequestCommit[],
): PullRequestCommit[] {
  return commits.slice().reverse();
}
