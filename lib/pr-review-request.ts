import type { PrViewer, PullRequestRef } from "./agent-api";
import type { PrTimelineEvent } from "./pr-timeline";

/** Whether the connected forge account has a pending direct review request. */
export function viewerReviewIsRequested(
  pr: PullRequestRef | null,
  viewer: PrViewer | null,
): boolean {
  if (!pr || pr.state !== "open" || pr.merged || !viewer?.login) return false;
  const viewerLogin = viewer.login.toLocaleLowerCase("en-US");
  return (pr.requestedReviewers ?? []).some(
    (reviewer) => reviewer.login.toLocaleLowerCase("en-US") === viewerLogin,
  );
}

/** Submitted reviews grouped by reviewer, newest verdict first within each group. */
export function reviewerReviewGroups(timeline: PrTimelineEvent[]) {
  const groups = new Map<string, PrTimelineEvent[]>();
  const reviews = timeline
    .filter((event) => event.kind === "reviewed")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  for (const review of reviews) {
    const key = review.actor?.login.toLowerCase() ?? review.id;
    const group = groups.get(key);
    if (group) group.push(review);
    else groups.set(key, [review]);
  }
  return [...groups.values()];
}
