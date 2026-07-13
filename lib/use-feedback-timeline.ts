"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchFeedbackEventsApi } from "./comments-api";
import type { TimelineItem } from "./use-issue-timeline";

/** React-query key for a feedback post's activity events — also invalidated by
    the team page after every mutation (feedback has no realtime). */
export const feedbackEventsKey = (projectId: string, postId: string) =>
  ["feedback-events", projectId, postId] as const;

/**
 * Activity events for one feedback post, shaped as a timeline — the feedback
 * twin of useIssueTimeline / useObjectiveTimeline. Events-only for now: internal
 * comments & @Numo land with MIN-51 and will merge into the same feed. No
 * realtime (feedback convention) — freshness comes from query invalidation.
 */
export function useFeedbackTimeline(projectId: string, postId: string | null) {
  const { data: events } = useQuery({
    queryKey: feedbackEventsKey(projectId, postId ?? ""),
    queryFn: () => fetchFeedbackEventsApi(projectId, postId as string),
    enabled: !!postId,
  });

  const items = useMemo<TimelineItem[]>(
    () =>
      (events ?? [])
        .map((e) => ({ kind: "event" as const, at: e.created_at, event: e }))
        .sort((a, b) => a.at.localeCompare(b.at)),
    [events]
  );

  return { items };
}
