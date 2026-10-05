import type { PullRequestListItem } from "./agent-api";

export type EditablePrState = Exclude<PullRequestListItem["pr_state"], "merged">;
export type PrStateAction = "close" | "reopen" | "ready_for_review" | "convert_to_draft";

/** Reopening preserves the forge's draft flag, so normalize it when necessary. */
export function prStateTransitionActions(
  current: EditablePrState,
  target: EditablePrState,
  draft: boolean,
): PrStateAction[] {
  if (current === target) return [];
  if (target === "closed") return ["close"];
  if (current === "closed") {
    if (target === "draft" && !draft) return ["reopen", "convert_to_draft"];
    if (target === "open" && draft) return ["reopen", "ready_for_review"];
    return ["reopen"];
  }
  return [target === "draft" ? "convert_to_draft" : "ready_for_review"];
}
