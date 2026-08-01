"use client";

// Les registres d'écritures en attente de l'application (MIN-156), et les
// helpers de cache montés au-dessus.
//
// Deux registres seulement : les tickets et les objectifs. Ce sont les deux
// entités qu'une édition patche localement — donc les deux que la réponse d'un
// fetch parti trop tôt peut défaire. Les vues DÉRIVÉES (["me","summary"],
// ["stats"]) restent hors périmètre : leur appartenance aux listes est calculée
// en SQL, y patcher un statut sans recalculer l'appartenance mentirait plus que
// ça ne corrige. Elles continuent d'être rafraîchies par le pont temps réel.
//
// Ce module vit sous le registre pur (pending-writes.ts) et au-dessus de
// react-query : c'est lui, et pas les hooks, qui sait où une ligne de ticket est
// recopiée — le cache du projet, le board agrégé, l'index de la palette.

import type { QueryClient } from "@tanstack/react-query";
import { createPendingWrites } from "./pending-writes";
import { patchSearchIndexIssue } from "../use-search-index";
import type {
  GlobalBoardResponse,
  Issue,
  Objective,
  SearchIndexIssue,
} from "../types";

/** Cache key for the aggregate cross-project board (MIN-29). Il vit ici plutôt
    que dans use-global-board-query.ts (qui le ré-exporte) pour que ce module
    reste importable depuis ce hook sans cycle d'import. */
export const GLOBAL_BOARD_KEY = ["me", "board"] as const;

const issuesKey = (projectId: string) => ["issues", projectId] as const;
const objectivesKey = (projectId: string) => ["objectives", projectId] as const;

export const issueWrites = createPendingWrites<Issue>();
export const objectiveWrites = createPendingWrites<Objective>();

/** Overlay des écritures en attente sur une liste de tickets de projet. */
export function applyPendingIssues(issues: Issue[], startedAt: number): Issue[] {
  return issueWrites.apply(issues, startedAt);
}

/** Même overlay sur le board agrégé — seule sa tranche `issues` est concernée. */
export function applyPendingBoard(
  board: GlobalBoardResponse,
  startedAt: number
): GlobalBoardResponse {
  const issues = issueWrites.apply(board.issues, startedAt);
  return issues === board.issues ? board : { ...board, issues };
}

export function applyPendingObjectives(
  objectives: Objective[],
  startedAt: number
): Objective[] {
  return objectiveWrites.apply(objectives, startedAt);
}

/**
 * Patch optimiste d'un ticket PARTOUT où sa ligne est recopiée : le cache de son
 * projet, le board cross-projet et l'index de la palette. C'est la version
 * partagée de ce que les rejouages d'annulation faisaient dans leur coin.
 */
export function patchIssueEverywhere(
  queryClient: QueryClient,
  projectId: string,
  issueId: string,
  patch: Partial<Issue>
): void {
  queryClient.setQueryData<Issue[]>(issuesKey(projectId), (old) =>
    old?.map((i) => (i.id === issueId ? { ...i, ...patch } : i))
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
    old
      ? {
          ...old,
          issues: old.issues.map((i) => (i.id === issueId ? { ...i, ...patch } : i)),
        }
      : old
  );
  patchSearchIndexIssue(queryClient, issueId, patch as Partial<SearchIndexIssue>);
}

/** Ajoute une carte aux deux caches de tickets (jamais en double). */
export function insertIssueEverywhere(
  queryClient: QueryClient,
  projectId: string,
  issue: Issue
): void {
  queryClient.setQueryData<Issue[]>(issuesKey(projectId), (old) =>
    old && !old.some((i) => i.id === issue.id) ? [...old, issue] : old
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
    old && !old.issues.some((i) => i.id === issue.id)
      ? { ...old, issues: [...old.issues, issue] }
      : old
  );
}

/** Remplace la carte optimiste par la ligne serveur (l'id change). */
export function replaceIssueEverywhere(
  queryClient: QueryClient,
  projectId: string,
  optimisticId: string,
  issue: Issue
): void {
  const swap = (i: Issue) => (i.id === optimisticId ? issue : i);
  queryClient.setQueryData<Issue[]>(issuesKey(projectId), (old) => old?.map(swap));
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
    old ? { ...old, issues: old.issues.map(swap) } : old
  );
}

/** Retire une carte des deux caches (création refusée, suppression). */
export function removeIssueEverywhere(
  queryClient: QueryClient,
  projectId: string,
  issueId: string
): void {
  const drop = (i: Issue) => i.id !== issueId;
  queryClient.setQueryData<Issue[]>(issuesKey(projectId), (old) => old?.filter(drop));
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
    old ? { ...old, issues: old.issues.filter(drop) } : old
  );
}

/**
 * Écrit la ligne serveur faisant autorité dans les mêmes caches, au lieu de les
 * invalider. C'est le pendant du patch optimiste au retour du PATCH : les effets
 * de bord serveur (auto-attribution, completed_at, sortie de cycle) arrivent
 * sans coûter un refetch d'une route agrégée à plusieurs secondes.
 */
export function mergeServerIssue(
  queryClient: QueryClient,
  projectId: string,
  issue: Issue
): void {
  patchIssueEverywhere(queryClient, projectId, issue.id, issue);
}

/** Le pendant pour un objectif : son cache de projet, rien d'autre. */
export function patchObjectiveCache(
  queryClient: QueryClient,
  projectId: string,
  objectiveId: string,
  patch: Partial<Objective>
): void {
  queryClient.setQueryData<Objective[]>(objectivesKey(projectId), (old) =>
    old?.map((o) => (o.id === objectiveId ? { ...o, ...patch } : o))
  );
}
