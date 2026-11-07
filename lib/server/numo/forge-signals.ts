import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { buildForgeAssigneeIndex, type ForgeAssigneeIndex } from "@/lib/server/git/forge-members";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Forge signals for background Numo (MIN-926): a review requested on a pull
 * request, and CI failing on it. Neither is a gesture on the ticket, so they
 * stay out of `issue_events` and the activity timeline: they go straight to
 * the event journal (`journal_pull_request_signal`), once per linked issue,
 * as `issue.pull_request` rows written by `system`.
 *
 * A signal names its recipient when the forge account maps to a member of
 * the project (the reviewer, or the pull request's author for CI): only that
 * member's batch receives it. Without a mapping, every member hears it and
 * the decision model (MIN-928) judges.
 *
 * Best effort: a lost signal is a missed wake-up, never a failed webhook.
 */

export type PullRequestSignal = "pr_review_requested" | "pr_checks_failed";

export interface PullRequestSignalInput {
  provider: RepoProviderId;
  pullRequest: { id: string; author_login: string | null };
  type: PullRequestSignal;
  /** The commit CI failed on: one failure per head is journaled. */
  headSha?: string | null;
  /** Forge logins asked to review; empty for a team request. */
  reviewerLogins?: string[];
}

/** GitHub check conclusions that mean the CI failed. */
export const FAILED_CHECK_CONCLUSIONS = new Set(["failure", "timed_out", "startup_failure"]);

/** GitHub commit-status states that mean the CI failed. */
export const FAILED_STATUS_STATES = new Set(["failure", "error"]);

/** Usernames a GitLab merge request update asked to review, absent before it. */
export function addedGitlabReviewers(changes: {
  reviewers?: { previous?: Array<{ username?: string }>; current?: Array<{ username?: string }> };
} | undefined): string[] {
  const before = new Set((changes?.reviewers?.previous ?? []).map((u) => u.username).filter(Boolean));
  return (changes?.reviewers?.current ?? [])
    .map((u) => u.username)
    .filter((login): login is string => !!login && !before.has(login));
}

/** Members the signal is addressed to; `[null]` means every member. */
export function signalRecipients(input: PullRequestSignalInput, index: ForgeAssigneeIndex): Array<string | null> {
  const logins = input.type === "pr_review_requested"
    ? input.reviewerLogins ?? []
    : input.pullRequest.author_login ? [input.pullRequest.author_login] : [];
  const members = [...new Set(logins
    .map((login) => index.get(login.trim().toLowerCase()))
    .filter((id): id is string => !!id))];
  // A request to someone minddy cannot name still tells the team about it.
  return members.length > 0 ? members : [null];
}

/** Journal the signal for every issue the pull request is linked to. Returns rows written. */
export async function journalPullRequestSignal(input: PullRequestSignalInput): Promise<number> {
  try {
    const service = getServiceClient();
    // Only routing columns of the linked issues: their content stays sealed.
    const { data: links, error: linkError } = await service.from("pull_request_issues")
      .select("issue_id, issues!inner(project_id)").eq("pull_request_id", input.pullRequest.id)
      .is("issues.deleted_at", null);
    if (linkError) throw new Error(linkError.message);
    const issues = ((links ?? []) as unknown as Array<{ issue_id: string; issues: { project_id: string } }>)
      .map((link) => ({ id: link.issue_id, project_id: link.issues.project_id }));

    const indexes = new Map<string, Promise<ForgeAssigneeIndex>>();
    let written = 0;
    for (const issue of issues) {
      const projectId = issue.project_id as string;
      if (!indexes.has(projectId)) {
        indexes.set(projectId, buildForgeAssigneeIndex({ projectId, provider: input.provider }));
      }
      for (const recipient of signalRecipients(input, await indexes.get(projectId)!)) {
        const { data, error } = await service.rpc("journal_pull_request_signal", {
          p_issue_id: issue.id,
          p_pull_request_id: input.pullRequest.id,
          p_type: input.type,
          p_head_sha: input.headSha ?? null,
          p_recipient_id: recipient,
        });
        if (error) throw new Error(error.message);
        if (data === true) written++;
      }
    }
    return written;
  } catch (error) {
    console.error("[forge-signals] journal failed:", (error as Error).message);
    return 0;
  }
}
