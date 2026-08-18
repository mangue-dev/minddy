import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import {
  issueStatusForPrState,
  type SyncableIssueStatus,
} from "@/lib/pr-issue-status";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { AgentRun } from "./runs";

/**
 * Aligns the status of the issue with the code agent lifecycle (MIN-46):
 * - agent launched, no PR yet available → `in_progress`
 * - PR DRAFT (not yet proposed) → `in_progress`
 *  - PR ouverte (disponible en revue)          → `in_review`
 * - Merged PR (accepted) → `done`
 * - PR closed (refused) → `todo` (return to be made, NOT canceled)
 *
 * `syncIssueStatusOnAgentStart` is called at startup/resume without PR
 * (launch.ts). `syncIssueStatusFromPr` is called when opening the PR
 * (execute.ts), on in-app review actions (merge/close) and on the webhook
 * GitHub (merge/close/reopen). Best effort: sync should never
 * Fail the calling flow.
 */

// The TABLE, for its part, lives in pure form in `lib/pr-issue-status`: the dialog which links a
// ticket to a PR in hand (MIN-163) announces it before making the gesture, and a
// module `server-only` cannot be read from the browser. Re-exported here, where
// all her server callers are already looking for her.
export { issueStatusForPrState } from "@/lib/pr-issue-status";

/**
 * Writes the status on the issue (best-effort, via Numo). Single crossing point.
 *
 * `forgeSync` switches the attribution: the writing still technically carries a
 * member (she crosses the gatekeeper of `updateIssueFields`), but the
 * timeline credits FORGE. This is the MIN-97 convention, repeated here for
 * PR without a run — no one in minddy made this move (MIN-143).
 */
async function applyIssueStatus(
  issueId: string,
  actorId: string,
  status: SyncableIssueStatus,
  forgeSync: RepoProviderId | null = null,
): Promise<void> {
  try {
    const result = await updateIssueFields({
      issueId,
      actorId,
      input: { status },
      // A human PR does not go through Numo: the credit goes to the forge, not to him.
      viaAssistant: !forgeSync,
      forgeSync,
      // THIS waypoint is the lifecycle of a run, never a request
      // (MIN-147). Without this flag it reads like the Numo assistant relaying a
      // instruction — and “PR denied → to do” restarted the entire loop.
      viaAgentRun: true,
    });
    if (!result.ok) {
      console.error(
        "[agent] issue status sync skipped:",
        result.errorKey ?? result.rawMessage ?? result.status,
      );
    }
  } catch (err) {
    console.error("[agent] issue status sync failed:", (err as Error).message);
  }
}

/**
 * The agent starts (or resumes) the work without PR available → the issue goes to
 * `in_progress`. Called at the start of a run and at the resumption of a session which
 * n'a pas (ou plus) de PR ouverte.
 */
export async function syncIssueStatusOnAgentStart(opts: {
  issueId: string;
  actorId: string;
}): Promise<void> {
  await applyIssueStatus(opts.issueId, opts.actorId, "in_progress");
}

export async function syncIssueStatusFromPr(opts: {
  issueId: string;
  /** Actor of the change (author of the run for the agent/webhook, user for merge/close in-app). */
  actorId: string;
  prState: AgentRun["pr_state"];
  /** Forge to be credited in place of the actor — a PR without a run (MIN-143). */
  forgeSync?: RepoProviderId | null;
}): Promise<void> {
  const status = issueStatusForPrState(opts.prState);
  if (!status) return;
  await applyIssueStatus(opts.issueId, opts.actorId, status, opts.forgeSync ?? null);
}
