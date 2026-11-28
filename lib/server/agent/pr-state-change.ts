import "server-only";

import type { PullRequestState } from "@/lib/pull-request-contract";
import type { RepoProviderId } from "@/lib/repo-providers";
import { syncIssueStatusFromPr } from "./issue-status-sync";
import { broadcastPrChanged } from "./pr-live";
import { pullRequestIssueIds, upsertPullRequest, type PullRequestRow } from "./pull-requests";

/**
 * Bookkeeping after minddy changed a PR's state at the forge (in-app gesture
 * or Numo's merge): the `pull_requests` row, the open PR panel, then every
 * linked ticket's status. Returns the linked ticket ids, for the caller's
 * activity events.
 *
 * Writing `pull_requests` already broadcasts to the list and the ticket panel
 * (migration 20260929090000). The open PR panel needs its own push: its
 * header and thread come from the forge, where the gesture added timeline
 * events (MIN-159).
 *
 * Forge webhooks and the repository sweep take a different path
 * (`applyForgePrToIssue`): they write as the repository linker and record the
 * forge actor's gesture.
 */
export async function applyPrStateChange(input: {
  target: { provider: RepoProviderId; repoFullName: string; number: number };
  /** The stored row, when the PR is already known to the table. */
  row: PullRequestRow | null;
  state: PullRequestState;
  actorId: string;
  /** Forge credited for the ticket status instead of Numo (MIN-143). */
  forgeSync?: RepoProviderId | null;
}): Promise<string[]> {
  const { target, row, state } = input;
  if (row) broadcastPrChanged(row.id, ["pr", "conversation"]);
  const updated = await upsertPullRequest({
    provider: target.provider,
    repoFullName: target.repoFullName,
    number: target.number,
    state,
    mergedAt: state === "merged" ? new Date().toISOString() : row?.merged_at ?? null,
    issueId: row?.issue_id ?? undefined,
  });
  const prId = updated?.id ?? row?.id;
  const issueIds = prId ? await pullRequestIssueIds(prId) : [];
  for (const issueId of issueIds) {
    await syncIssueStatusFromPr({
      issueId,
      actorId: input.actorId,
      prState: state,
      openedAt: updated?.opened_at ?? row?.opened_at ?? null,
      forgeSync: input.forgeSync ?? null,
    });
  }
  return issueIds;
}
