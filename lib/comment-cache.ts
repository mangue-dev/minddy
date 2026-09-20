import type { QueryClient, QueryKey } from "@tanstack/react-query";

interface CachedComment {
  id: string;
  parent_id: string | null;
  updated_at: string;
}

/** Keep hydrated fields, such as attachments, absent from a PATCH response. */
export function mergeComment<T extends CachedComment>(
  comments: T[] | undefined,
  saved: T,
  insertIfMissing = true,
): T[] {
  if (!comments) return insertIfMissing ? [saved] : [];
  const index = comments.findIndex((comment) => comment.id === saved.id);
  if (index === -1) return insertIfMissing ? [...comments, saved] : comments;
  const current = comments[index];
  // A realtime refresh or another completed edit can already be newer.
  if (Date.parse(current.updated_at) > Date.parse(saved.updated_at)) return comments;
  const next = [...comments];
  next[index] = { ...current, ...saved };
  return next;
}

export function removeCommentThread<T extends CachedComment>(
  comments: T[] | undefined,
  commentId: string,
): T[] | undefined {
  return comments?.filter(
    (comment) => comment.id !== commentId && comment.parent_id !== commentId,
  );
}

/**
 * Publish the acknowledged write before background reconciliation. Cancel any
 * older read first so it cannot put the pre-write discussion back on screen.
 */
export async function publishCommentWrite<T extends CachedComment>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  update: (comments: T[] | undefined) => T[] | undefined,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData<T[]>(queryKey, update);
  void queryClient.invalidateQueries({ queryKey, exact: true });
}
