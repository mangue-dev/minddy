"use client";

// Qui et quoi on peut citer depuis le composer de Numo — mentions « @ » dans le
// message ET contexte épinglé par le bouton @.
//
// Rien ne se charge tant que `enabled` est faux : ouvrir le panneau ne doit
// déclencher aucune requête, seul le geste qui a besoin de la liste le fait
// (taper « @ », ouvrir le menu d'ajout).

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { useMembersQuery } from "@/lib/use-members-query";
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
