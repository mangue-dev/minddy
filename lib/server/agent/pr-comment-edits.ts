import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Previous versions of PR thread comments (MIN-548): one row per edit, the
 * body the comment carried BEFORE the rewrite. Captured on two paths:
 * - edits made FROM minddy — the API snapshots the current body before the
 *   forge write (`updatePrCommentResponse`);
 * - edits made on github.com — the `issue_comment` webhook `edited` payload
 *   carries the previous body in `changes.body.from` and the receiver
 *   records it (GitLab has no note-edit webhook: only the first path exists
 *   there).
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
