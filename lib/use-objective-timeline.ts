"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  addObjectiveCommentApi,
  deleteAttachmentApi,
  deleteCommentApi,
  fetchObjectiveCommentsApi,
  fetchObjectiveEventsApi,
  updateCommentApi,
} from "./comments-api";
import type { AttachmentInput } from "./types";
import type { TimelineItem } from "./use-issue-timeline";

const commentsKey = (objectiveId: string) => ["objective-comments", objectiveId] as const;
const eventsKey = (objectiveId: string) => ["objective-events", objectiveId] as const;

/**
 * Comments + activity events for one objective, merged into a chronological
 * timeline — the objective twin of useIssueTimeline. The reduce/thread logic is
 * identical; only the endpoints (and query keys) differ. Live updates come from
 * the realtime bridge (lib/realtime-provider.tsx).
 */
export function useObjectiveTimeline(objectiveId: string | null) {
  const queryClient = useQueryClient();

  const { data: comments } = useQuery({
    queryKey: commentsKey(objectiveId ?? ""),
    queryFn: () => fetchObjectiveCommentsApi(objectiveId as string),
    enabled: !!objectiveId,
  });
  const { data: events } = useQuery({
    queryKey: eventsKey(objectiveId ?? ""),
    queryFn: () => fetchObjectiveEventsApi(objectiveId as string),
    enabled: !!objectiveId,
  });

  const items = useMemo<TimelineItem[]>(() => {
    const all = comments ?? [];
    const rootIds = new Set(all.filter((c) => !c.parent_id).map((c) => c.id));
    const repliesByRoot = new Map<string, (typeof all)[number][]>();
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

  const addComment = useCallback(
    async (
      body: string,
      mentionedUserIds: string[] = [],
      parentId: string | null = null,
      attachments: AttachmentInput[] = []
    ) => {
      await addObjectiveCommentApi(objectiveId as string, body, mentionedUserIds, parentId, attachments);
      void queryClient.invalidateQueries({ queryKey: commentsKey(objectiveId as string) });
    },
    [objectiveId, queryClient]
  );
  const updateComment = useCallback(
    async (commentId: string, body: string) => {
      await updateCommentApi(commentId, body);
      void queryClient.invalidateQueries({ queryKey: commentsKey(objectiveId as string) });
    },
    [objectiveId, queryClient]
  );
  const deleteComment = useCallback(
    async (commentId: string) => {
      await deleteCommentApi(commentId);
      void queryClient.invalidateQueries({ queryKey: commentsKey(objectiveId as string) });
    },
    [objectiveId, queryClient]
  );
  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      await deleteAttachmentApi(attachmentId);
      void queryClient.invalidateQueries({ queryKey: commentsKey(objectiveId as string) });
    },
    [objectiveId, queryClient]
  );

  return { items, addComment, updateComment, deleteComment, deleteAttachment };
}
