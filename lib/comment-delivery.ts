import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { mergeComment } from "./comment-cache";

/** Local delivery state. Never serialize an unconfirmed write into the read cache. */
export interface CommentDelivery {
  state: "sending" | "error";
  error?: string;
  retry: () => void;
  discard: () => Promise<void>;
}

interface DeliverableComment {
  id: string;
  parent_id: string | null;
  updated_at: string;
  delivery?: CommentDelivery;
  attachments?: readonly unknown[];
}

/** Preserve in-flight/failed drafts through realtime reads, deduplicated by UUID. */
export function reconcileCommentRead<T extends DeliverableComment>(
  saved: T[],
  current: T[] | undefined,
): T[] {
  const pending = current?.filter((comment) => comment.delivery) ?? [];
  if (!pending.length) return saved;
  const serverById = new Map(saved.map((comment) => [comment.id, comment]));
  const overlays = pending.filter((comment) => {
    const confirmed = serverById.get(comment.id);
    return comment.delivery?.state === "sending" || !confirmed ||
      (confirmed.attachments?.length ?? 0) < (comment.attachments?.length ?? 0);
  });
  const overlayIds = new Set(overlays.map((comment) => comment.id));
  return [...saved.filter((comment) => !overlayIds.has(comment.id)), ...overlays];
}

/**
 * Publish before POST, retain failed content and resources on the thread, and
 * retry only at the user's request with the same server-recognized UUID.
 * The composer can clear as soon as this function returns. It never owns the
 * only copy of a submitted draft, including when its route unmounts.
 */
export function deliverComment<T extends DeliverableComment>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  draft: T,
  send: () => Promise<T>,
  remove: () => Promise<void> = async () => {},
): void {
  let sending = false;
  // Cancellation reverts an older read synchronously before the draft is added.
  void queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData<T[]>(queryKey, (comments) => mergeComment(comments, draft));
  const query = queryClient.getQueryCache().find({ queryKey, exact: true });
  const stillOwned = () => query === queryClient.getQueryCache().find({ queryKey, exact: true });
  const update = (comment: T) => {
    if (!stillOwned()) return;
    queryClient.setQueryData<T[]>(queryKey, (comments) => comments?.map((current) =>
      current.id === draft.id ? comment : current));
  };
  const discard = async () => {
    if (sending || !stillOwned()) return;
    sending = true;
    try {
      // A failed response can still have committed a body. Delete by the same
      // UUID before removing the retained draft, rather than hiding that body.
      await remove();
      if (!stillOwned()) return;
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (!stillOwned()) return;
      queryClient.setQueryData<T[]>(queryKey,
        (comments) => comments?.filter((comment) => comment.id !== draft.id));
      void queryClient.invalidateQueries({ queryKey, exact: true });
    } finally {
      sending = false;
    }
  };
  const attempt = () => {
    if (sending || !stillOwned()) return;
    sending = true;
    update({ ...draft, delivery: { state: "sending", retry: attempt, discard } });
    void (async () => {
      try {
        const saved = await send();
        if (!stillOwned()) return;
        await queryClient.cancelQueries({ queryKey, exact: true });
        if (!stillOwned()) return;
        queryClient.setQueryData<T[]>(queryKey, (comments) => {
          // Preserve newer server edits but remove local delivery controls.
          const clean = comments?.map((comment) => {
            if (comment.id !== saved.id) return comment;
            return comment.delivery ? saved : comment;
          });
          return mergeComment(clean, saved);
        });
      } catch (error) {
        update({ ...draft, delivery: {
          state: "error",
          error: error instanceof Error ? error.message : String(error),
          retry: attempt,
          discard,
        } });
      } finally {
        sending = false;
        // Also reconcile an ambiguous network failure: the server may have
        // committed successfully even though its response did not reach us.
        if (stillOwned()) void queryClient.invalidateQueries({ queryKey, exact: true });
      }
    })();
  };
  attempt();
}
