"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  addCommentApi,
  deleteAttachmentApi,
  deleteCommentApi,
  fetchCommentsApi,
  fetchEventsApi,
  updateCommentApi,
} from "./comments-api";
import type { AttachmentInput, Comment, IssueEvent } from "./types";

export type TimelineItem =
  | { kind: "comment"; at: string; comment: Comment; replies: Comment[] }
  | { kind: "event"; at: string; event: IssueEvent };

const commentsKey = (issueId: string) => ["comments", issueId] as const;
const eventsKey = (issueId: string) => ["events", issueId] as const;

/**
 * Comments + activity events for one issue, merged into a chronological
 * timeline. Live updates (e.g. Numo replying) come from the central realtime
 * bridge (lib/realtime-provider.tsx) invalidating ["comments"|"events", issueId].
 */
export function useIssueTimeline(issueId: string | null) {
  const queryClient = useQueryClient();

  const { data: comments } = useQuery({
    queryKey: commentsKey(issueId ?? ""),
    queryFn: () => fetchCommentsApi(issueId as string),
    enabled: !!issueId,
    // While a @Numo reply streams (assistant_status 'working'), poll as a
    // safety net for the realtime push. Its TEXT rides the comment's own topic
    // (lib/use-comment-live.ts); this catches the state transitions — the tool
    // it moved to, the final message, an error — if a broadcast is missed.
    refetchInterval: (query) =>
      (query.state.data as Comment[] | undefined)?.some(
        (c) => c.assistant_status === "working"
      )
        ? 1500
        : false,
  });
  const { data: events } = useQuery({
    queryKey: eventsKey(issueId ?? ""),
    queryFn: () => fetchEventsApi(issueId as string),
    enabled: !!issueId,
  });

  const items = useMemo<TimelineItem[]>(() => {
    // Threads: replies (parent_id = root comment) attach under their root;
    // a thread card stays anchored at the root's created_at.
    const all = comments ?? [];
    const rootIds = new Set(all.filter((c) => !c.parent_id).map((c) => c.id));
    const repliesByRoot = new Map<string, Comment[]>();
    for (const c of all) {
      if (c.parent_id && rootIds.has(c.parent_id)) {
        const list = repliesByRoot.get(c.parent_id) ?? [];
        list.push(c);
        repliesByRoot.set(c.parent_id, list);
      }
    }
    const merged: TimelineItem[] = [
      ...(events ?? []).map((e) => ({ kind: "event" as const, at: e.created_at, event: e })),
      ...all
        // Orphan replies (missing root) are promoted to roots, defensively.
        .filter((c) => !c.parent_id || !rootIds.has(c.parent_id))
        .map((c) => ({
          kind: "comment" as const,
          at: c.created_at,
          comment: c,
          replies: repliesByRoot.get(c.id) ?? [],
        })),
    ];
    merged.sort((a, b) => a.at.localeCompare(b.at));
    return merged;
  }, [comments, events]);

  const addComment = useCallback(
    async (
      body: string,
      mentionedUserIds: string[] = [],
      parentId: string | null = null,
      attachments: AttachmentInput[] = []
    ) => {
      await addCommentApi(issueId as string, body, mentionedUserIds, parentId, attachments);
      void queryClient.invalidateQueries({ queryKey: commentsKey(issueId as string) });
    },
    [issueId, queryClient]
  );
  const updateComment = useCallback(
    async (commentId: string, body: string) => {
      await updateCommentApi(commentId, body);
      void queryClient.invalidateQueries({ queryKey: commentsKey(issueId as string) });
    },
    [issueId, queryClient]
  );
  const deleteComment = useCallback(
    async (commentId: string) => {
      await deleteCommentApi(commentId);
      void queryClient.invalidateQueries({ queryKey: commentsKey(issueId as string) });
    },
    [issueId, queryClient]
  );
  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      await deleteAttachmentApi(attachmentId);
      void queryClient.invalidateQueries({ queryKey: commentsKey(issueId as string) });
    },
    [issueId, queryClient]
  );

  return { items, addComment, updateComment, deleteComment, deleteAttachment };
}
