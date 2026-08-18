"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  addCommentApi,
  deleteResourceApi,
  deleteCommentApi,
  fetchCommentsApi,
  fetchEventsApi,
  updateCommentApi,
} from "./comments-api";
import type { Comment, IssueEvent, ResourceInput } from "./types";

export type TimelineItem =
  | { kind: "comment"; at: string; comment: Comment; replies: Comment[] }
  | { kind: "event"; at: string; event: IssueEvent };

const commentsKey = (issueId: string) => ["comments", issueId] as const;
const eventsKey = (issueId: string) => ["events", issueId] as const;

/** The birth of the ticket, such as carrying ITS OWN LINE. */
export interface IssueBirth {
  createdAt: string;
  createdBy: string | null;
  /** Ticket born from an integration (API Feedback): the actor is the integration. */
  integrationId?: string | null;
}

/** Does a ticket ever have the line in its log that says where it came from? */
const hasBirthEvent = (events: IssueEvent[]) =>
  events.some((e) => e.type === "created" || e.type === "imported");

/**
 * RECONSTITUTED birth line, when the log does not carry it.
 *
 * The `created` event is a separate, best-effort write: it can have
 * failed (see lib/server/create-issue.ts), and tickets born from one insert
 * direct — the demo world — have never had one. The ticket always knows
 * when and by whom it was born: it is its own line. Without this fallback, the timeline
 * of these tickets displays "No activity" - of a ticket that exists.
 *
 * Reconstructed, therefore never written: nothing goes to webhook, nothing is inserted.
 * The id is synthetic and stable, it is only used for the keys of React.
 */
const birthEvent = (issueId: string, birth: IssueBirth): IssueEvent => ({
  id: `birth:${issueId}`,
  issue_id: issueId,
  actor_id: birth.createdBy,
  type: "created",
  field: null,
  from_value: null,
  to_value: null,
  integration_id: birth.integrationId ?? null,
  created_at: birth.createdAt,
});

/**
 * The timeline itself: events + comment threads, in
 * order. Pure, outside of React — this is where you decide what the panel
 * SHOWS, so this is where it's tested.
 *
 * `events === undefined` means "not yet loaded", and is distinguished from a
 * empty log: the birth fallback only comes into play once the response
 * arrived, otherwise the line would flash before being overtaken by the real one.
 */
export function buildTimelineItems({
  events,
  comments,
  issueId,
  birth,
}: {
  events: IssueEvent[] | undefined;
  comments: Comment[] | undefined;
  issueId: string | null;
  birth?: IssueBirth | null;
}): TimelineItem[] {
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
  const loadedEvents = events ?? [];
  const allEvents =
    events && issueId && birth && !hasBirthEvent(loadedEvents)
      ? [birthEvent(issueId, birth), ...loadedEvents]
      : loadedEvents;
  const merged: TimelineItem[] = [
    ...allEvents.map((e) => ({ kind: "event" as const, at: e.created_at, event: e })),
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
  // Sort by time, going back by Date: two timestamps of the same time
  // are not necessarily written the same (`+00:00` of PostgREST against `Z`
  // from a client-side ISO), and a STRING comparison would then classify them
  // by their typography. At the same time, the order of arrival is preserved.
  merged.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return merged;
}

/**
 * Comments + activity events for one issue, merged into a chronological
 * timeline. Live updates (e.g. Numo replying) come from the central realtime
 * bridge (lib/realtime-provider.tsx) invalidating ["comments"|"events", issueId].
 *
 * `birth` is the display fallback described above: skip the ticket himself
 * guarantees that his timeline always starts with his birth.
 */
export function useIssueTimeline(issueId: string | null, birth?: IssueBirth | null) {
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

  const birthAt = birth?.createdAt ?? null;
  const birthBy = birth?.createdBy ?? null;
  const birthIntegration = birth?.integrationId ?? null;
  const items = useMemo<TimelineItem[]>(
    () =>
      buildTimelineItems({
        events,
        comments,
        issueId,
        birth: birthAt
          ? { createdAt: birthAt, createdBy: birthBy, integrationId: birthIntegration }
          : null,
      }),
    [comments, events, issueId, birthAt, birthBy, birthIntegration]
  );

  const addComment = useCallback(
    async (
      body: string,
      mentionedUserIds: string[] = [],
      parentId: string | null = null,
      attachments: ResourceInput[] = []
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
      await deleteResourceApi(attachmentId);
      void queryClient.invalidateQueries({ queryKey: commentsKey(issueId as string) });
    },
    [issueId, queryClient]
  );

  return { items, addComment, updateComment, deleteComment, deleteAttachment };
}
