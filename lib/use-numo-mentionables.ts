"use client";

// Qui et quoi on peut citer depuis le composer de Numo — mentions « @ » dans le
// message ET contexte épinglé par le bouton @.
//
// Rien ne se charge tant que `enabled` est faux : ouvrir le panneau ne doit
// déclencher aucune requête, seul le geste qui a besoin de la liste le fait
// (taper « @ », ouvrir le menu d'ajout).

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { displayName } from "@/lib/display-name";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useMentionSources } from "@/lib/use-mention-sources";
import { useProjects } from "@/lib/projects-context";
import type { MentionOption } from "@/components/mention-suggest";
import type { GlobalBoardResponse, Member } from "@/lib/types";

/**
 * Les membres mentionnables. En portée projet, ceux de CE projet (une requête
 * légère). En global, ceux de tous mes projets, dédoublonnés : ils voyagent
 * avec le board agrégé, déjà en cache dès qu'on a ouvert « Tous les tickets ».
 */
export function useNumoMembers(
  enabled: boolean,
  scopeProjectId: string | null,
): { members: Member[]; loading: boolean } {
  const scoped = useMembersQuery(scopeProjectId, enabled && !!scopeProjectId);
  const board = useNumoBoard(enabled && !scopeProjectId);

  const global = useMemo(() => {
    const byId = new Map<string, Member>();
    for (const list of Object.values(board.data?.members ?? {})) {
      for (const m of list) if (!byId.has(m.user_id)) byId.set(m.user_id, m);
    }
    return [...byId.values()];
  }, [board.data]);

  return scopeProjectId
    ? { members: scoped.members, loading: scoped.loading }
    : { members: global, loading: board.isLoading };
}

/**
 * Tout ce qu'un « @ » peut citer depuis un composer de Numo, et le geste qui
 * l'arme. Les deux composers qui parlent à Numo — le panneau et l'accueil —
 * partent d'ici : la liste des membres, des projets, des tickets et des
 * objectifs y est construite UNE fois, dans le même ordre et avec les mêmes
 * termes de recherche, plutôt que réécrite de part et d'autre.
 *
 * `onMentionQuery` se branche directement sur le composer : rien ne se charge
 * tant qu'aucun « @ » n'a été tapé. Le premier arme les membres (une requête)
 * et réclame l'index de la palette tout de suite au lieu d'attendre le temps
 * mort qui l'arme d'habitude — monter un composer, lui, ne coûte rien.
 */
export function useNumoMentionables(scopeProjectId: string | null): {
  mentionables: MentionOption[];
  onMentionQuery: (active: boolean) => void;
} {
  const [wanted, setWanted] = useState(false);
  const { members } = useNumoMembers(wanted, scopeProjectId);
  const { projects } = useProjects();
  // Tickets et objectifs viennent de l'index de la palette, comme les mentions
  // d'une description : il porte déjà tout, de tous mes projets.
  const { issues, objectives, armNow } = useMentionSources(scopeProjectId);

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
        iconUrl: p.icon_url,
        keywords: [p.key],
      })),
      // Le TITRE en second rang, et cherchable : on retrouve « le ticket sur
      // les webhooks » sans en connaître le numéro.
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
    ],
    [members, projects, issues, objectives],
  );

  const onMentionQuery = useCallback(
    (active: boolean) => {
      if (!active) return;
      setWanted(true);
      armNow();
    },
    [armNow],
  );

  return { mentionables, onMentionQuery };
}

/**
 * Le board agrégé (tous mes tickets), chargé À LA DEMANDE et partagé avec le
 * board « Tous les tickets » et le picker de la page Agents — même clé de
 * cache, donc jamais deux fois.
 */
export function useNumoBoard(enabled: boolean) {
  return useQuery<GlobalBoardResponse>({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: globalBoardQueryFn,
    enabled,
    staleTime: 30_000,
  });
}
