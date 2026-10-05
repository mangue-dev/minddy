import type { PullRequestListItem } from "./agent-api";

export const PULL_REQUEST_SECTIONS = ["created", "review", "team", "completed"] as const;
export type PullRequestSection = typeof PULL_REQUEST_SECTIONS[number];
export const DEFAULT_PULL_REQUEST_SECTIONS: readonly PullRequestSection[] = ["created", "review", "team"];

/** Each PR has one section; completed PRs never remain in a review queue. */
export function pullRequestSection(
  pr: Pick<PullRequestListItem, "pr_state" | "createdByMe" | "reviewRequestedForMe">,
): PullRequestSection {
  if (pr.pr_state === "merged" || pr.pr_state === "closed") return "completed";
  if (pr.createdByMe) return "created";
  if (pr.reviewRequestedForMe) return "review";
  return "team";
}

export function groupPullRequestsBySection(items: readonly PullRequestListItem[]) {
  return PULL_REQUEST_SECTIONS
    .map((key) => ({ key, items: items.filter((pr) => pullRequestSection(pr) === key) }))
    .filter((group) => group.items.length > 0);
}
