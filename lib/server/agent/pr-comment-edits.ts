import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Previous versions of PR thread comments (MIN-548): one row per edit, the
 * body the comment carried BEFORE the rewrite. `comment_id` 0 is the body of
 * the pull request itself — the thread's opening message. Captured on two
 * paths per subject:
 * - edits made FROM minddy — the API snapshots the current body before the
 *   forge write (`updatePrCommentResponse`, `prMaintenanceActionResponse`);
 * - edits made on github.com — the webhooks deliver the previous body
 *   (`issue_comment` `changes.body.from` for comments, `pull_request`
 *   `changes.body.from` for the body; GitLab has no note-edit webhook: only
 *   the first path exists there).
 *
 * An edit from minddy echoes back through the webhook a few seconds later
 * carrying the SAME previous body; the echo is not a second version. The
 * recorder therefore skips a row whose body equals the newest snapshot of
 * the same comment — which also collapses replayed deliveries.
 *
 * WRITES go through the service client only: the table has no insert policy,
 * like other forge-fed tables. READS go through RLS on the
 * `project_git_links` shape — the same rule as `pull_requests.select` — so a
 * member of any project linking the repository can list the history.
 */

export interface PrCommentEditRow {
  body: string;
  edited_by: string | null;
  created_at: string;
}

/**
 * Records ONE previous version of a comment. Never throws: the edit API and
 * the webhook receiver both treat a failed snapshot as a gap in the history,
 * not as a broken gesture — the edit itself must still land.
 */
export async function recordPrCommentEditQuiet(input: {
  provider: RepoProviderId;
  repoFullName: string;
  prNumber: number;
  commentId: number;
  body: string;
  editedBy: string | null;
}): Promise<void> {
  // An edit from minddy echoes through the webhook carrying the SAME
  // previous body, and replayed deliveries repeat themselves: a row whose
  // body equals the newest snapshot of this comment is not a version, skip
  // it. The read is also best effort — on failure, record anyway (a
  // duplicate read as a gap is better than a lost version).
  const { data: newest } = await getServiceClient()
    .from("pr_comment_edits")
    .select("body")
    .eq("provider", input.provider)
    .eq("repo_full_name", input.repoFullName)
    .eq("pr_number", input.prNumber)
    .eq("comment_id", input.commentId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (newest?.length === 1 && newest[0].body === input.body) return;
  const { error } = await getServiceClient()
    .from("pr_comment_edits")
    .insert({
      provider: input.provider,
      repo_full_name: input.repoFullName,
      pr_number: input.prNumber,
      comment_id: input.commentId,
      body: input.body,
      edited_by: input.editedBy,
    });
  if (error) {
    console.error("[pr-comment-edits] insert failed:", error.message);
  }
}

/** Previous versions of one comment, OLDEST-first. */
export async function listPrCommentEdits(input: {
  provider: RepoProviderId;
  repoFullName: string;
  prNumber: number;
  commentId: number;
}): Promise<PrCommentEditRow[]> {
  const { data } = await getServiceClient()
    .from("pr_comment_edits")
    .select("body, edited_by, created_at")
    .eq("provider", input.provider)
    .eq("repo_full_name", input.repoFullName)
    .eq("pr_number", input.prNumber)
    .eq("comment_id", input.commentId)
    .order("created_at", { ascending: true })
    .limit(100);
  return ((data ?? []) as PrCommentEditRow[]).map((row) => ({
    body: row.body ?? "",
    edited_by: row.edited_by ?? null,
    created_at: row.created_at,
  }));
}
