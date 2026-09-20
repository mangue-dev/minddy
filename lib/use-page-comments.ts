"use client";

// The thread of a page, client side (MIN-282).
//
// A single request — the ENTIRE thread — and everything else is calculation: order
// and the detach live in lib/page-comments.ts, which knows nothing about
// network. This module just plugs the two together, and the writes that make them
// change.
//
// REAL TIME does not pass through here: the bridge (lib/realtime-provider.tsx)
// invalidates `["page-comments", pageId]` on any writing broadcast by the topic
// of the project. No channel per page — page presence already goes through the
// topic of the project, opening a second one would double the subscriptions for the same
// information.

import { useAuth } from "./auth-context";
import { createUuid } from "./create-uuid";
import { deliverComment, reconcileCommentRead } from "./comment-delivery";
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mergeComment, publishCommentWrite, removeCommentThread } from "./comment-cache";

import {
  addPageCommentApi,
  deletePageCommentApi,
  fetchPageCommentsApi,
  updatePageCommentApi,
} from "@/lib/pages-api";
import {
  arrangeThreads,
  type PageComment,
  type PageThread,
} from "@/lib/page-comments";

export const pageCommentsKey = (pageId: string) =>
  ["page-comments", pageId] as const;

export interface PageCommentsHandle {
  comments: PageComment[];
  /** The threads VISIBLE, ordered — detached at the head. */
  threads: PageThread[];
  loading: boolean;
  add: (input: {
    body: string;
    blockId?: string | null;
    quote?: string | null;
    parentId?: string | null;
    mentionedUserIds?: string[];
  }) => Promise<void>;
  edit: (commentId: string, body: string) => Promise<void>;
  remove: (commentId: string) => Promise<void>;
}

export function usePageComments({
  projectId,
  pageId,
  /** The block ids of the document AS IT IS ON SCREEN — it, not
 the last save, decides what is detached. */
  blockIds,
}: {
  projectId: string;
  pageId: string;
  blockIds: ReadonlySet<string>;
}): PageCommentsHandle {
  const queryClient = useQueryClient();
  const authorId = useAuth().user?.id ?? null;
  const { data, isPending } = useQuery({
    queryKey: pageCommentsKey(pageId),
    queryFn: async () => reconcileCommentRead(
      await fetchPageCommentsApi(projectId, pageId),
      queryClient.getQueryData<PageComment[]>(pageCommentsKey(pageId)),
    ),
    // Live text uses the per-comment broadcast topic; polling is the safety net
    // for durable state transitions if a broadcast is missed.
    refetchInterval: (query) =>
      (query.state.data as PageComment[] | undefined)?.some(
        (comment) => comment.assistant_status === "working"
      )
        ? 1500
        : false,
  });
  const comments = useMemo(() => data ?? [], [data]);

  const threads = useMemo(
    () => arrangeThreads(comments, blockIds),
    [comments, blockIds]
  );
  const add = useCallback<PageCommentsHandle["add"]>(
    async (input) => {
      if (!authorId) throw new Error("Comment author is unavailable");
      const id = createUuid();
      const now = new Date().toISOString();
      const parent = queryClient.getQueryData<PageComment[]>(pageCommentsKey(pageId))
        ?.find((comment) => comment.id === input.parentId);
      const draft: PageComment = {
        id, page_id: pageId, project_id: projectId, author_id: authorId,
        body: input.body.trim(), parent_id: parent?.parent_id ?? input.parentId ?? null,
        block_id: parent ? parent.block_id : input.blockId ?? null,
        quote: input.parentId ? null : input.quote ?? null,
        created_at: now, updated_at: now,
      };
      deliverComment(queryClient, pageCommentsKey(pageId), draft,
        () => addPageCommentApi(projectId, pageId, { ...input, id }),
        () => deletePageCommentApi(projectId, pageId, id, true));
    },
    [projectId, pageId, authorId, queryClient]
  );
  const edit = useCallback<PageCommentsHandle["edit"]>(
    async (commentId, body) => {
      const saved = await updatePageCommentApi(projectId, pageId, commentId, body);
      await publishCommentWrite<PageComment>(queryClient, pageCommentsKey(pageId),
        (comments) => mergeComment(comments, saved, false));
    },
    [projectId, pageId, queryClient]
  );
  const remove = useCallback<PageCommentsHandle["remove"]>(
    async (commentId) => {
      await deletePageCommentApi(projectId, pageId, commentId);
      await publishCommentWrite<PageComment>(queryClient, pageCommentsKey(pageId),
        (comments) => removeCommentThread(comments, commentId));
    },
    [projectId, pageId, queryClient]
  );
  return {
    comments,
    threads,
    loading: isPending,
    add,
    edit,
    remove,
  };
}
