import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type DeleteCommentThreadResult =
  | { status: "deleted"; storagePaths: string[] }
  | { status: "not_found"; storagePaths: [] };

/** Delete one comment (and its replies when it is a root) while atomically
 * capturing every storage path removed by the database cascade. */
export async function deleteCommentThreadAtomic(
  client: SupabaseClient,
  commentId: string,
): Promise<DeleteCommentThreadResult> {
  const { data, error } = await client.rpc("delete_comment_thread_atomic", {
    p_comment_id: commentId,
  });
  if (error) throw new Error(error.message);

  const result = data as { status?: unknown; storage_paths?: unknown } | null;
  if (result?.status !== "deleted") {
    return { status: "not_found", storagePaths: [] };
  }
  return {
    status: "deleted",
    storagePaths: Array.isArray(result.storage_paths)
      ? [
          ...new Set(
            result.storage_paths.filter(
              (path): path is string => typeof path === "string" && path !== "",
            ),
          ),
        ]
      : [],
  };
}
