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
import { contentMentionScanner, type MentionScan } from "@/lib/mention-scan";
import {
  useMentionLinksFor,
  useMentionSources,
} from "@/lib/use-mention-sources";
import type { MentionLinks } from "@/components/mention-links";
import { useFeatureMentions } from "@/lib/use-feature-mentions";
import { useOfferedProject } from "@/lib/use-offered-projects";
import type { MentionOption } from "@/components/mention-suggest";
import type { AssistantMention } from "@/lib/assistant-types";
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
export function useNumoMentionables(
  scopeProjectId: string | null,
  references?: AssistantMention[],
): {
  mentionables: MentionOption[];
  /** Where the pills of messages ALREADY sent lead: the thread is reread, and a
 ticket cited there opens with a click (components/mention-links). */
  links: MentionLinks;
  /** Rehydrates saved plain-text mentions into interactive pills. */
  scan: MentionScan;
  onMentionQuery: (active: boolean) => void;
} {
  const [wanted, setWanted] = useState(false);
  const { members } = useNumoMembers(wanted, scopeProjectId);
  // Tickets and objectives come from the palette index, like the mentions
  // a description: it already carries everything, of all my projects. Pages are
  // those of the project in scope, or of every project without one (MIN-899).
  const {
    projects: mentionProjects,
    issues,
    objectives,
    pages,
    accountPages,
    offered,
    offeredPages,
    armNow,
  } = useMentionSources(
    scopeProjectId,
    wanted,
  );

  // Without a project, every project's pages are offered (MIN-899): their
  // pills must open them too. `accountPages` is empty in a project.
  const linkedPages = useMemo(
    () => (accountPages.length ? accountPages : pages),
    [accountPages, pages],
  );
  const entityLinks = useMentionLinksFor({ issues, objectives, pages: linkedPages, references });
  // Pull requests, routines, the notebook, cycles and MCP servers (MIN-872),
  // loaded at the first "@". Skills are the composer's own pills.
  const features = useFeatureMentions(scopeProjectId, useOfferedProject(scopeProjectId));
  const links = useMemo<MentionLinks>(() => ({
    ...entityLinks,
    label: (type, id, meta) => entityLinks.label?.(type, id, meta) ?? features.label(type, id, meta),
    detail: features.detail,
  }), [entityLinks, features]);
  const scan = useMemo(
    () =>
      contentMentionScanner({
        members,
        projects: mentionProjects,
        issues,
        objectives,
        pages,
      }),
    [members, mentionProjects, issues, objectives, pages],
  );

  const projectNames = useMemo(
    () => new Map(mentionProjects.map((project) => [project.id, project.name])),
    [mentionProjects],
  );
  const mentionables = useMemo<MentionOption[]>(
    () => [
      ...members.map((m) => ({
        type: "member" as const,
        id: m.user_id,
        label: displayName(m),
        avatarSeed: m.avatar_seed,
        keywords: m.email ? [m.email] : [],
      })),
      // Hidden projects and their items are not offered (MIN-751); the scan
      // and the links above still resolve what earlier messages cite.
      ...offered.projects.map((p) => ({
        type: "project" as const,
        id: p.id,
        label: p.name,
        avatarSeed: p.avatarSeed,
        iconUrl: p.iconUrl,
        keywords: [p.key],
      })),
      // The TITLE in second row, and searchable: we find “the ticket on
      // webhooks” without knowing the number.
      ...offered.issues.map((i) => ({
        type: "issue" as const,
        id: i.id,
        projectId: i.project_id,
        label: i.identifier,
        detail: i.title,
        status: i.status,
        keywords: [i.title],
      })),
      ...offered.objectives.map((o) => ({
        type: "objective" as const,
        id: o.id,
        projectId: o.project_id,
        label: o.name,
        color: o.color,
        // The status glyph replaces the target in the suggestion (MIN-785).
        objectiveStatus: o.status,
      })),
      // Wiki pages (MIN-273): quoting “@Guide” is enough that Numo reads the
      // document before responding. In a project, its own pages; without one,
      // those of every project, each naming its project, since two wikis may
      // both hold a “Guide” (MIN-899).
      ...offeredPages
        .filter((p) => p.title.trim())
        .map((p) => {
          const project = scopeProjectId ? undefined : projectNames.get(p.project_id);
          return {
            type: "page" as const,
            id: p.id,
            projectId: p.project_id,
            label: p.title,
            icon: p.icon,
            ...(project ? { detail: project } : {}),
          };
        }),
      ...features.options.filter((option) => option.type !== "skill"),
    ],
    [members, offered, offeredPages, scopeProjectId, projectNames, features.options],
  );

  const onMentionQuery = useCallback(
    (active: boolean) => {
      if (!active) return;
      setWanted(true);
      armNow();
      features.arm();
    },
    [armNow, features],
  );

  return { mentionables, links, scan, onMentionQuery };
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
