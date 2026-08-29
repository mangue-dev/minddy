"use client";

// The thread of a page, client side (MIN-282).
//
// A single request — the ENTIRE thread — and everything else is calculation: order
// and the detach live in lib/page-comments.ts, which knows nothing about
// network. This module just plugs the two together, and the writes that make them
// bouger.
//
// REAL TIME does not pass through here: the bridge (lib/realtime-provider.tsx)
// invalidates `["page-comments", pageId]` on any writing broadcast by the topic
// of the project. No channel per page — page presence already goes through the
// topic of the project, opening a second one would double the subscriptions for the same
// information.

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const { data, isPending } = useQuery({
    queryKey: pageCommentsKey(pageId),
    queryFn: () => fetchPageCommentsApi(projectId, pageId),
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
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: pageCommentsKey(pageId) });
  }, [queryClient, pageId]);

  const add = useCallback<PageCommentsHandle["add"]>(
    async (input) => {
      await addPageCommentApi(projectId, pageId, input);
      refresh();
    },
    [projectId, pageId, refresh]
  );
  const edit = useCallback<PageCommentsHandle["edit"]>(
    async (commentId, body) => {
      await updatePageCommentApi(projectId, pageId, commentId, body);
      refresh();
    },
    [projectId, pageId, refresh]
  );
  const remove = useCallback<PageCommentsHandle["remove"]>(
    async (commentId) => {
      await deletePageCommentApi(projectId, pageId, commentId);
      refresh();
    },
    [projectId, pageId, refresh]
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
