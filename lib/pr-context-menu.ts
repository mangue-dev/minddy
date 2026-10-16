import type { AgentRunPrResponse, PullRequestListItem } from "@/lib/agent-api";
import type { PullRequestReadiness } from "@/lib/pr-readiness";
import type { EditablePrState } from "@/lib/pr-state-transition";

type PrState = PullRequestListItem["pr_state"];

// What a pull request row's right-click menu may offer (MIN-685). The forge
// stays the final judge: these rules only keep impossible gestures off the
// menu, and the server refuses anything that changed in the meantime.

/** The state transitions a pull request may take, given where it stands. */
export function prMenuStateTargets(state: PrState): EditablePrState[] {
  if (state === "merged") return [];
  if (state === "closed") return ["open"];
  if (state === "draft") return ["open", "closed"];
  return ["draft", "closed"];
}

/**
 * Merge is offered only on a fresh read of an open, non-draft pull request
 * whose readiness allows it with at least one repository method. The server
 * rechecks everything when the merge is confirmed.
 */
export function prMenuCanMerge(
  state: PrState,
  draft: boolean,
  readiness: PullRequestReadiness | null | undefined,
): boolean {
  return state === "open" && !draft && !!readiness?.mergeAllowed && readiness.methods.length > 0;
}

/** Whether something stands between the pull request and its merge. */
export function prMenuNeedsFix(
  data: Pick<AgentRunPrResponse, "checks" | "readiness"> | undefined,
  unresolvedThreadCount: number,
): boolean {
  return (
    !!data?.checks?.checks.some((check) => check.state === "failure") ||
    unresolvedThreadCount > 0 ||
    !!data?.readiness?.blockers.some(
      (blocker) => blocker.kind === "conflicts" || blocker.kind === "branch",
    )
  );
}
