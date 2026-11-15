import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import { issueStatusForPrState } from "@/lib/pr-issue-status";
import type { PullRequestState } from "@/lib/pull-request-contract";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Aligns the status of every linked issue with its pull request (MIN-46),
 * following the table of `lib/pr-issue-status`. Called by in-app PR actions,
 * Numo's merge, the forge webhooks and the repository sweep. Best effort: a
 * failed status write never fails the calling flow.
 *
 * `forgeSync` switches the attribution: the write still carries a member
 * (`updateIssueFields` checks project access), but the timeline credits the
 * forge (MIN-97, MIN-143). Without it the write is shown as relayed by Numo.
 */
export async function syncIssueStatusFromPr(opts: {
  issueId: string;
  /** Actor of the change (the repository linker for the webhook, the user for in-app actions). */
  actorId: string;
  prState: PullRequestState | null;
  /** Forge to be credited in place of the actor (MIN-143). */
  forgeSync?: RepoProviderId | null;
}): Promise<void> {
  const status = issueStatusForPrState(opts.prState);
  if (!status) return;
  const forgeSync = opts.forgeSync ?? null;
  try {
    const result = await updateIssueFields({
      issueId: opts.issueId,
      actorId: opts.actorId,
      input: { status },
      viaAssistant: !forgeSync,
      forgeSync,
    });
    if (!result.ok) {
      console.error(
        "[agent] issue status sync skipped:",
        result.errorKey ?? result.status,
      );
    }
  } catch {
    console.error("[agent] issue_status_sync_failed");
  }
}
