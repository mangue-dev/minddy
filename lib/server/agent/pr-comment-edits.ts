import "server-only";
import { createHash } from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { repositoryStorageName } from "@/lib/server/git/repository-name-content";
import { decodePrCommentEdit, encodePrCommentEdit,
  shouldEncryptPrCommentEdit } from "./pr-comment-edit-content";

/**
 * Previous versions of PR thread comments (MIN-548): one row per edit, the
 * body the comment carried BEFORE the rewrite. `comment_id` 0 is the body of
 * the pull request itself — the thread's opening message. Captured on two
 * paths per subject:
 * - edits made from minddy — the API reads the current body before the forge
 *   write and records it after success with the returned edit timestamp;
 * - edits made on github.com — the webhooks deliver the previous body
 *   (`issue_comment` `changes.body.from` for comments, `pull_request`
 *   `changes.body.from` for the body; GitLab has no note-edit webhook: only
 *   the first path exists there).
 *
 * An edit from minddy echoes back through the webhook a few seconds later
 * carrying the SAME previous body; the echo is not a second version. The
 * recorder uses the forge edit timestamp for ordering and a deterministic ID
 * for that event and previous body, so echoes and replays are idempotent even
 * when deliveries arrive out of order.
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
  occurredAt: string | null | undefined;
}): Promise<void> {
  // An undated snapshot cannot be ordered safely against delayed deliveries.
  const timestamp = input.occurredAt ? Date.parse(input.occurredAt) : NaN;
  if (!Number.isFinite(timestamp)) return;
  const createdAt = new Date(timestamp).toISOString();
  try {
    const storedName = await repositoryStorageName(input.provider,
      input.repoFullName, true);
    // UUID v8: the primary key deduplicates concurrent API/webhook echoes.
    // Including the body preserves distinct edits with the same forge timestamp.
    const digest = createHash("sha256").update(JSON.stringify([
      input.provider, storedName, input.prNumber, input.commentId, createdAt, input.body,
    ])).digest().subarray(0, 16);
    digest[6] = (digest[6] & 0x0f) | 0x80;
    digest[8] = (digest[8] & 0x3f) | 0x80;
    const hex = digest.toString("hex");
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const body = await shouldEncryptPrCommentEdit()
      ? await encodePrCommentEdit(id, input.body) : input.body;
    const { error } = await getServiceClient()
      .from("pr_comment_edits")
      .insert({
        id,
        provider: input.provider,
        repo_full_name: storedName,
        pr_number: input.prNumber,
        comment_id: input.commentId,
        body,
        edited_by: input.editedBy,
        created_at: createdAt,
      });
    if (error && error.code !== "23505") {
      console.error("[pr-comment-edits] insert_failed", error.code);
    }
  } catch {
    console.error("[pr-comment-edits] snapshot_failed");
  }
}

/** Previous versions of one comment, OLDEST-first. */
export async function listPrCommentEdits(input: {
  provider: RepoProviderId;
  repoFullName: string;
  prNumber: number;
  commentId: number;
}): Promise<PrCommentEditRow[]> {
  const storedName = await repositoryStorageName(input.provider,
    input.repoFullName,false);
  const { data, error } = await getServiceClient()
    .from("pr_comment_edits")
    .select("id, body, edited_by, created_at")
    .eq("provider", input.provider)
    .eq("repo_full_name", storedName)
    .eq("pr_number", input.prNumber)
    .eq("comment_id", input.commentId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error("Unable to load previous comment versions");
  return Promise.all(((data ?? []) as (PrCommentEditRow & { id: string })[])
    .map(async (row) => ({
    body: await decodePrCommentEdit(row.id, row.body ?? ""),
    edited_by: row.edited_by ?? null,
    created_at: row.created_at,
  })));
}
