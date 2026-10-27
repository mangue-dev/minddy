import type { PullRequestListItem } from "./agent-api";

export const COMPLETED_PULL_REQUESTS_PAGE = 10;
export const PULL_REQUEST_SECTIONS = ["created", "review", "team", "completed"] as const;
export type PullRequestSection = typeof PULL_REQUEST_SECTIONS[number];
/** How many open PRs the account shell keeps prepared in the background. */
export const PR_BACKGROUND_LIMIT = 5;
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

/**
 * The sections follow the filter, not the content (MIN-817): every checked
 * section is returned, empty ones included, and a row whose section is not
 * checked never appears, whatever the caller passes in.
 */
export function groupPullRequestsBySection(
  items: readonly PullRequestListItem[],
  checked: ReadonlySet<string>,
) {
  return PULL_REQUEST_SECTIONS
    .filter((key) => checked.has(key))
    .map((key) => ({ key, items: items.filter((pr) => pullRequestSection(pr) === key) }));
}

/**
 * The open PRs the list shows first, in display order: section by section,
 * then the list's own order inside each (MIN-817). Background preparation
 * warms these, so the rows at the top of the page open without a skeleton —
 * the plain list order put recent team PRs ahead of the reader's own.
 */
export function firstDisplayedOpenPullRequestIds(
  items: readonly Pick<PullRequestListItem, "prId" | "pr_state" | "createdByMe" | "reviewRequestedForMe">[],
  limit: number,
): string[] {
  const open = items.filter((pr) => pr.pr_state === "open" || pr.pr_state === "draft");
  const ordered = PULL_REQUEST_SECTIONS.flatMap((key) => open.filter((pr) => pullRequestSection(pr) === key));
  return [...new Set(ordered.map((pr) => pr.prId))].slice(0, limit);
}
