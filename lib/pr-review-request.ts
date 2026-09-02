import type { PrViewer, PullRequestRef } from "./agent-api";

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
