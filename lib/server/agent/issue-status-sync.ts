import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import { issueStore } from "@/lib/server/issue-store";
import { resolveForgeWorkStatus, type ForgeWorkSignal } from "@/lib/forge-work-status";
import type { IssueStatus } from "@/lib/issue-constants";
import type { PullRequestState } from "@/lib/pull-request-contract";
import type { RepoProviderId } from "@/lib/repo-providers";
import { readForgeWork } from "@/lib/server/git/issue-code-work";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Aligns the status of an issue with the code work linked to it (MIN-46,
 * MIN-1037). The single entry point of every forge signal: a pull request
 * that changes state (in-app actions, Numo's merge, webhooks, the repository
 * sweep) and commits or a branch pushed without one (push webhooks, the
 * default-branch sweep).
 *
 * The status is resolved from ALL the work linked to the issue, by
 * `resolveForgeWorkStatus`; the signal only bounds what may be written. Best
 * effort: a failed status write never fails the calling flow.
 *
 * `forgeSync` switches the attribution: the write still carries a member
 * (`updateIssueFields` checks project access), but the timeline credits the
 * forge (MIN-97, MIN-143). Without it the write is shown as relayed by Numo.
 */
export async function syncIssueStatusFromForgeWork(opts: {
  issueId: string;
  /** Member who carries the write: the repository linker for a forge event,
      the user for an in-app action. */
  actorId: string;
  signal: ForgeWorkSignal;
  /** Forge to be credited in place of the actor (MIN-143). */
  forgeSync?: RepoProviderId | null;
}): Promise<void> {
  const forgeSync = opts.forgeSync ?? null;
  try {
    const [{ data: issue }, work] = await Promise.all([
      issueStore(getServiceClient()).select("status")
        .eq("id", opts.issueId).is("deleted_at", null).maybeSingle(),
      readForgeWork(opts.issueId),
    ]);
    const current = (issue as { status?: IssueStatus } | null)?.status;
    if (!current) return;
    const status = resolveForgeWorkStatus({ current, signal: opts.signal, work });
    if (!status) return;
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

/**
 * The pull request form of the sync: `prState` is the state the pull request
 * just took. `openedAt` dates it, so that a delivery older than the pull
 * request does not keep its issue done when it closes.
 */
export async function syncIssueStatusFromPr(opts: {
  issueId: string;
  /** Actor of the change (the repository linker for the webhook, the user for in-app actions). */
  actorId: string;
  prState: PullRequestState | null;
  openedAt?: string | null;
  /** Forge to be credited in place of the actor (MIN-143). */
  forgeSync?: RepoProviderId | null;
}): Promise<void> {
  if (!opts.prState) return;
  await syncIssueStatusFromForgeWork({
    issueId: opts.issueId,
    actorId: opts.actorId,
    signal: { kind: "pull_request", state: opts.prState, openedAt: opts.openedAt ?? null },
    forgeSync: opts.forgeSync,
  });
}
