"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  addFeedbackCommentApi,
  deleteResourceApi,
  deleteFeedbackCommentApi,
  fetchFeedbackCommentsApi,
  fetchFeedbackEventsApi,
  updateFeedbackCommentApi,
} from "./comments-api";
import type { Comment, ResourceInput } from "./types";
import type { CommentVisibility } from "./feedback/types";
import type { TimelineItem } from "./use-issue-timeline";

/** React-query keys for a feedback post's activity + internal comments. Both are
    invalidated by the central realtime bridge (a feedback comment / event
    broadcasts on the project topic, MIN-51) and by the team page after each
    mutation. */
export const feedbackEventsKey = (projectId: string, postId: string) =>
  ["feedback-events", projectId, postId] as const;
export const feedbackCommentsKey = (projectId: string, postId: string) =>
  ["feedback-comments", projectId, postId] as const;

/**
 * Internal comments + activity events for one feedback post, merged into a
 * chronological timeline — the feedback twin of useIssueTimeline /
 * useObjectiveTimeline (MIN-51, full parity with tickets/objectives). Live
 * updates (e.g. Numo replying) arrive via the realtime bridge invalidating
 * these keys; a short refetch fallback while a Numo reply is still "working"
 * keeps the stream flowing even if a broadcast is missed.
 */
export function useFeedbackTimeline(projectId: string, postId: string | null) {
  const queryClient = useQueryClient();

  const { data: comments } = useQuery({
    queryKey: feedbackCommentsKey(projectId, postId ?? ""),
    queryFn: () => fetchFeedbackCommentsApi(projectId, postId as string),
    enabled: !!postId,
    // While a @Numo reply streams (assistant_status 'working'), poll as a
    // safety net for the realtime push.
    refetchInterval: (query) =>
      (query.state.data as Comment[] | undefined)?.some(
        (c) => c.assistant_status === "working"
      )
        ? 1500
        : false,
  });
  const { data: events } = useQuery({
    queryKey: feedbackEventsKey(projectId, postId ?? ""),
    queryFn: () => fetchFeedbackEventsApi(projectId, postId as string),
    enabled: !!postId,
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

  const invalidate = useCallback(
    () =>
      void queryClient.invalidateQueries({
        queryKey: feedbackCommentsKey(projectId, postId as string),
      }),
    [projectId, postId, queryClient]
  );

  const addComment = useCallback(
    async (
      body: string,
      mentionedUserIds: string[] = [],
      parentId: string | null = null,
      attachments: ResourceInput[] = [],
      visibility: CommentVisibility = "internal"
    ) => {
      await addFeedbackCommentApi(
        projectId,
        postId as string,
        body,
        mentionedUserIds,
        parentId,
        attachments,
        visibility
      );
      invalidate();
    },
    [projectId, postId, invalidate]
  );
  const updateComment = useCallback(
    async (commentId: string, body: string) => {
      await updateFeedbackCommentApi(projectId, postId as string, commentId, body);
      invalidate();
    },
    [projectId, postId, invalidate]
  );
  const deleteComment = useCallback(
    async (commentId: string) => {
      await deleteFeedbackCommentApi(projectId, postId as string, commentId);
      invalidate();
    },
    [projectId, postId, invalidate]
  );
  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      await deleteResourceApi(attachmentId);
      invalidate();
    },
    [invalidate]
  );

  return { items, addComment, updateComment, deleteComment, deleteAttachment };
}
