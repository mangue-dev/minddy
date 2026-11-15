import "server-only";

import { collapsesInBurst, forgeActorValue, type PrActionEventType } from "@/lib/pr-events";
import type { PullRequestState, ReviewVerdict } from "@/lib/pull-request-contract";
import type { RepoProviderId } from "@/lib/repo-providers";
import { insertEvents } from "@/lib/server/issue-events";
import { getServiceClient } from "@/lib/supabase-service";
import { hasRecentPrEvent } from "./pr-activity";
import { lockTarget, type PrScope } from "./pr-scope";
import { applyPrStateChange } from "./pr-state-change";

/**
 * Traces a pull request gesture in the activity log of the linked ticket:
 * merge, close, approve, request changes, or comment on the conversation or
 * code. The actor is the member who acts, never Numo.
 *
 * `from_value` does not carry an actor here because `actor_id` already does, but
 * it carries the provider (see `forgeActorValue`). Without it, `describeEvent`
 * falls back to “pull request” and a GitLab user sees GitHub vocabulary on their
 * own ticket.
 *
 * Actions that repeat during one user gesture, such as review comments, are
 * grouped within a short window (`collapsesInBurst`); otherwise three adjacent
 * line remarks would create three identical activity entries.
 *
 * Best-effort: `insertEvents` absorbs its errors so activity synchronization
 * cannot break the action.
 */
export async function recordPrActionEvent(
  issueId: string,
  actorId: string,
  type: PrActionEventType,
  prNumber: number,
  provider: RepoProviderId,
): Promise<void> {
  if (
    collapsesInBurst(type) &&
    (await hasRecentPrEvent({ issueIds: [issueId], type, prNumber, actorId }))
  ) {
    return;
  }
  await insertEvents(getServiceClient(), [
    {
      issue_id: issueId,
      actor_id: actorId,
      type,
      from_value: forgeActorValue(provider, null),
      to_value: String(prNumber),
    },
  ]);
}

/**
 * Review verdict → activity event.
 *
 * “Comment” records a message: this route requires a non-empty body for that
 * verdict, matching the GitHub webhook's `commented` review with a body.
 */
export function eventForVerdict(verdict: ReviewVerdict): PrActionEventType {
  if (verdict === "approve") return "pr_approved";
  if (verdict === "request_changes") return "pr_changes_requested";
  return "pr_commented";
}

/** Applies the new state, then records the gesture on every linked ticket. */
export async function settlePrState(
  scope: PrScope,
  state: PullRequestState,
  userId: string,
  event: PrActionEventType | null,
): Promise<void> {
  const issueIds = await applyPrStateChange({
    target: lockTarget(scope),
    row: scope.pr,
    state,
    actorId: userId,
  });
  if (!event) return;
  for (const issueId of issueIds) {
    await recordPrActionEvent(issueId, userId, event, scope.pr.number, scope.target.provider);
  }
}
