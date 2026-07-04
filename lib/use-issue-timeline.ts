"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo } from "react";
import { getSupabase } from "./supabase";
import {
  addCommentApi,
  deleteCommentApi,
  fetchCommentsApi,
  fetchEventsApi,
  updateCommentApi,
} from "./comments-api";
import type { Comment, IssueEvent } from "./types";

export type TimelineItem =
  | { kind: "comment"; at: string; comment: Comment }
  | { kind: "event"; at: string; event: IssueEvent };

const commentsKey = (issueId: string) => ["comments", issueId] as const;
const eventsKey = (issueId: string) => ["events", issueId] as const;

/** Comments + activity events for one issue, merged into a chronological timeline. */
export function useIssueTimeline(issueId: string | null) {
  const queryClient = useQueryClient();
  const channelId = useId();

  const { data: comments } = useQuery({
    queryKey: commentsKey(issueId ?? ""),
    queryFn: () => fetchCommentsApi(issueId as string),
    enabled: !!issueId,
  });
  const { data: events } = useQuery({
    queryKey: eventsKey(issueId ?? ""),
    queryFn: () => fetchEventsApi(issueId as string),
    enabled: !!issueId,
  });

  useEffect(() => {
    if (!issueId) return;
    const supabase = getSupabase();
    const commentsCh = supabase
      .channel(`comments:${issueId}:${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `issue_id=eq.${issueId}` },
        () => void queryClient.invalidateQueries({ queryKey: commentsKey(issueId) })
      )
      .subscribe();
    const eventsCh = supabase
      .channel(`events:${issueId}:${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "issue_events", filter: `issue_id=eq.${issueId}` },
        () => void queryClient.invalidateQueries({ queryKey: eventsKey(issueId) })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(commentsCh);
      void supabase.removeChannel(eventsCh);
    };
  }, [queryClient, issueId, channelId]);

  const items = useMemo<TimelineItem[]>(() => {
    const merged: TimelineItem[] = [
      ...(events ?? []).map((e) => ({ kind: "event" as const, at: e.created_at, event: e })),
      ...(comments ?? []).map((c) => ({ kind: "comment" as const, at: c.created_at, comment: c })),
    ];
    merged.sort((a, b) => a.at.localeCompare(b.at));
    return merged;
  }, [comments, events]);

  const addComment = useCallback(
    async (body: string) => {
      await addCommentApi(issueId as string, body);
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

  return { items, addComment, updateComment, deleteComment };
}
