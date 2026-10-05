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

/** Submitted reviews grouped by reviewer, newest review first within each group. */
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

/** Comment-only reviews do not replace an earlier approval or change request. */
export function reviewCardTone(
  timeline: PrTimelineEvent[],
  requestedReviewers: { login: string; avatar_url: string | null }[],
): "danger" | "success" | "neutral" {
  const verdicts = reviewerReviewGroups(timeline).map(
    (group) =>
      group.find(
        (review) =>
          review.reviewState === "approved" || review.reviewState === "changes_requested",
      ) ?? group[0],
  );
  if (verdicts.some((review) => review.reviewState === "changes_requested")) {
    return "danger";
  }
  return verdicts.length > 0 &&
    verdicts.every((review) => review.reviewState === "approved") &&
    requestedReviewers.length === 0
    ? "success"
    : "neutral";
}
