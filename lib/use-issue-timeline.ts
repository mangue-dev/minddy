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

/** La naissance du ticket, telle que la porte SA PROPRE LIGNE. */
export interface IssueBirth {
  createdAt: string;
  createdBy: string | null;
  /** Ticket né d'une intégration (API Feedback) : l'acteur est l'intégration. */
  integrationId?: string | null;
}

/** Un ticket a-t-il déjà, dans son journal, la ligne qui dit d'où il vient ? */
const hasBirthEvent = (events: IssueEvent[]) =>
  events.some((e) => e.type === "created" || e.type === "imported");

/**
 * Ligne de naissance RECONSTITUÉE, quand le journal ne la porte pas.
 *
 * L'événement `created` est une écriture à part, best-effort : elle peut avoir
 * échoué (voir lib/server/create-issue.ts), et les tickets nés d'un insert
 * direct — le monde de démo — n'en ont jamais eu. Le ticket, lui, sait toujours
 * quand et par qui il est né : c'est sa propre ligne. Sans ce repli, la timeline
 * de ces tickets-là affiche « Aucune activité » — d'un ticket qui existe.
 *
 * Reconstitué, donc jamais écrit : rien ne part en webhook, rien ne s'insère.
 * L'id est synthétique et stable, il ne sert qu'aux clés de React.
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
 * Le fil chronologique lui-même : événements + fils de commentaires, dans
 * l'ordre. Pur, hors de React — c'est ici que se décide ce que le panneau
 * MONTRE, donc c'est ici que ça se teste.
 *
 * `events === undefined` veut dire « pas encore chargés », et se distingue d'un
 * journal vide : le repli de naissance n'entre en scène qu'une fois la réponse
 * arrivée, sinon la ligne clignoterait avant de se faire doubler par la vraie.
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
  // Tri par instant, en repassant par Date : deux horodatages du même instant
  // ne s'écrivent pas forcément pareil (`+00:00` de PostgREST contre le `Z`
  // d'un ISO côté client), et une comparaison de CHAÎNES les classerait alors
  // par leur typographie. À instant égal, l'ordre d'arrivée est conservé.
  merged.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return merged;
}

/**
 * Comments + activity events for one issue, merged into a chronological
 * timeline. Live updates (e.g. Numo replying) come from the central realtime
 * bridge (lib/realtime-provider.tsx) invalidating ["comments"|"events", issueId].
 *
 * `birth` est le repli d'affichage décrit ci-dessus : passer le ticket lui-même
 * garantit que sa timeline commence toujours par sa naissance.
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
