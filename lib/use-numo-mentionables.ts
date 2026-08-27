"use client";

// Who and what we can quote from the Numo composition — “@” mentions in the
// message AND context pinned by the @ button.
//
// Nothing loads as long as `enabled` is false: opening the panel should not
// trigger no request, only the gesture that needs the list does it
// (type “@”, open the add menu).

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { displayName } from "@/lib/display-name";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { useMembersQuery } from "@/lib/use-members-query";
import {
  useMentionLinksFor,
  useMentionSources,
} from "@/lib/use-mention-sources";
import { useProjects } from "@/lib/projects-context";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import type { MentionLinks } from "@/components/mention-links";
import type { MentionOption } from "@/components/mention-suggest";
import type { GlobalBoardResponse, Member } from "@/lib/types";

/**
 * Mentionable members. In project scope, those of THIS project (a lightweight
 * request). Overall, those of all my projects, deduplicated: they travel
 * with the aggregated board, already in cache as soon as we opened "All tickets".
 */
export function useNumoMembers(
  enabled: boolean,
  scopeProjectId: string | null,
): { members: Member[]; loading: boolean } {
  const scoped = useMembersQuery(scopeProjectId, enabled && !!scopeProjectId);
  const boardOn = enabled && !scopeProjectId;
  const board = useNumoBoard(boardOn);

  const global = useMemo(() => {
    const byId = new Map<string, Member>();
    for (const list of Object.values(board.data?.members ?? {})) {
      for (const m of list) if (!byId.has(m.user_id)) byId.set(m.user_id, m);
    }
    return [...byId.values()];
  }, [board.data]);

  return scopeProjectId
    ? { members: scoped.members, loading: scoped.loading }
    : { members: global, loading: boardOn && board.isPending };
}

/**
 * Everything an “@” can quote from a Numo composer, and the gesture that
 * arms it. The two composers that talk to Numo — the panel and the reception —
 * start from here: the list of members, projects, tickets and
 * objectives is built there ONCE, in the same order and with the same
 * search terms, rather than rewritten on both sides.
 *
 * `onMentionQuery` plugs directly into the composer: nothing loads
 * as long as no “@” has been typed. The first arms the members (a request)
 * and requests the index of the palette immediately instead of waiting for the dead time
 * which usually arms it — setting up a composer costs nothing.
 */
export function useNumoMentionables(scopeProjectId: string | null): {
  mentionables: MentionOption[];
  /** Where the pills of messages ALREADY sent lead: the thread is reread, and a
 ticket cited there opens with a click (components/mention-links). */
  links: MentionLinks;
  onMentionQuery: (active: boolean) => void;
} {
  const [wanted, setWanted] = useState(false);
  const { members } = useNumoMembers(wanted, scopeProjectId);
  const { projects } = useProjects();
  // Tickets and objectives come from the palette index, like the mentions
  // a description: it already carries everything, of all my projects. The pages, they
  // are those of the project in scope — a wiki belongs to its project.
  const { issues, objectives, pages, armNow } = useMentionSources(
    scopeProjectId,
    wanted,
  );

  const links = useMentionLinksFor({ issues, objectives, pages });

  const mentionables = useMemo<MentionOption[]>(
    () => [
      ...members.map((m) => ({
        type: "member" as const,
        id: m.user_id,
        label: displayName(m),
        avatarSeed: m.avatar_seed,
        keywords: m.email ? [m.email] : [],
      })),
      ...projects.map((p) => ({
        type: "project" as const,
        id: p.id,
        label: p.name,
        avatarSeed: projectOrbSeed(p),
        iconUrl: p.icon_url,
        keywords: [p.key],
      })),
      // The TITLE in second row, and searchable: we find “the ticket on
      // webhooks” without knowing the number.
      ...issues.map((i) => ({
        type: "issue" as const,
        id: i.id,
        label: i.identifier,
        detail: i.title,
        keywords: [i.title],
      })),
      ...objectives.map((o) => ({
        type: "objective" as const,
        id: o.id,
        label: o.name,
        color: o.color,
      })),
      // The wiki pages of the current project (MIN-273): quoting “@Guide” is enough
      // that Numo reads the document before responding.
      ...pages
        .filter((p) => p.title.trim())
        .map((p) => ({
          type: "page" as const,
          id: p.id,
          label: p.title,
          icon: p.icon,
        })),
    ],
    [members, projects, issues, objectives, pages],
  );

  const onMentionQuery = useCallback(
    (active: boolean) => {
      if (!active) return;
      setWanted(true);
      armNow();
    },
    [armNow],
  );

  return { mentionables, links, onMentionQuery };
}

/**
 * The aggregated board (all my tickets), loaded ON DEMAND and shared with the
 * board “All tickets” and the picker of the Agents page — same key of
 * cache, so never twice.
 */
export function useNumoBoard(enabled: boolean) {
  return useQuery<GlobalBoardResponse>({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: globalBoardQueryFn,
    enabled,
    staleTime: 30_000,
  });
}
