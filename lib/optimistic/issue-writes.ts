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
  Category,
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
const categoriesKey = (projectId: string) => ["categories", projectId] as const;

export const issueWrites = createPendingWrites<Issue>();
export const objectiveWrites = createPendingWrites<Objective>();

/**
 * Une réponse scopée à UN projet ne doit jamais recevoir la ligne d'un voisin.
 *
 * Le registre, lui, est global : une carte créée depuis le board cross-projet
 * ne sait pas quelle liste la lira, et `apply` ajoute toute insertion en
 * attente à la liste qu'on lui présente. Sans ce rescopage, une création encore
 * en vol dans le projet A s'ajoutait à la réponse du projet B — un
 * préchargement au survol ou un refetch de B pendant le POST suffisait à faire
 * apparaître la carte du voisin dans son tableau. Les `patch` et les `remove`,
 * eux, sont désignés par un id : ils ne peuvent pas se tromper de liste.
 */
function scopeToProject<T extends { project_id: string }>(
  applied: T[],
  original: T[],
  projectId: string | undefined
): T[] {
  if (applied === original || !projectId) return applied;
  const scoped = applied.filter((row) => row.project_id === projectId);
  return scoped.length === applied.length ? applied : scoped;
}

/** Overlay des écritures en attente sur la liste de tickets d'un projet. */
export function applyPendingIssues(
  issues: Issue[],
  startedAt: number,
  projectId?: string
): Issue[] {
  return scopeToProject(issueWrites.apply(issues, startedAt), issues, projectId);
}

/** Overlay des écritures en attente sur la liste d'objectifs d'un projet. */
export function applyPendingObjectives(
  objectives: Objective[],
  startedAt: number,
  projectId?: string
): Objective[] {
  return scopeToProject(
    objectiveWrites.apply(objectives, startedAt),
    objectives,
    projectId
  );
}

/**
 * Même overlay sur le board agrégé. Il porte DEUX tranches qu'une édition
 * patche localement : ses tickets, et sa copie des objectifs par projet — les
 * puces des cartes, la facette « Objectif » de la barre d'outils et le
 * sélecteur du panneau d'un ticket lisent celle-ci, pas `["objectives", pid]`.
 * Sans elle dans l'overlay, une réponse de `/api/me/board` partie avant le
 * PATCH d'un objectif rejouait son ancien nom (ou son ancienne couleur) sur
 * `/all`, exactement comme elle le faisait pour les tickets.
 */
export function applyPendingBoard(
  board: GlobalBoardResponse,
  startedAt: number
): GlobalBoardResponse {
  const issues = issueWrites.apply(board.issues, startedAt);
  let objectives = board.objectives;
  for (const [projectId, list] of Object.entries(board.objectives)) {
    const applied = applyPendingObjectives(list, startedAt, projectId);
    if (applied === list) continue;
    if (objectives === board.objectives) objectives = { ...board.objectives };
    objectives[projectId] = applied;
  }
  return issues === board.issues && objectives === board.objectives
    ? board
    : { ...board, issues, objectives };
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

/**
 * Le pendant pour un objectif : son cache de projet ET la copie que le board
 * cross-projet porte pour ce projet.
 *
 * Les deux, parce que les deux sont lues : le panneau latéral, les cartes de la
 * page Objectifs et la bannière du board d'un projet lisent
 * `["objectives", pid]` ; les puces des cartes de `/all`, sa facette
 * « Objectif » et le sélecteur d'objectif du panneau d'un ticket lisent
 * `["me","board"].objectives`. Rien ne rafraîchissait la seconde sur une
 * édition d'objectif — ni le chemin de succès, ni l'écho temps réel — donc un
 * objectif renommé restait affiché sous son ancien nom sur le board
 * cross-projet jusqu'à ce qu'autre chose fasse recharger la route.
 */
/**
 * Une catégorie qui vient de naître (ajout rapide depuis un picker) est écrite
 * dans les DEUX caches qui la lisent, avant même le refetch : celui de son
 * projet et la tranche `categories` du board cross-projet. Sans ça, la pastille
 * que l'utilisateur vient de cocher n'a pas de nom ni de couleur à afficher
 * jusqu'au retour du GET — un blanc d'une demi-seconde sur le geste le plus
 * rapide de l'app.
 */
export function insertCategoryEverywhere(
  queryClient: QueryClient,
  projectId: string,
  category: Category
): void {
  queryClient.setQueryData<Category[]>(categoriesKey(projectId), (old) =>
    old && !old.some((c) => c.id === category.id) ? [...old, category] : old
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) => {
    // Tranche absente quand le projet n'avait AUCUNE catégorie (la route
    // groupe les lignes, elle ne pose pas de clé vide) — c'est justement le
    // projet où l'ajout rapide sert le plus.
    const list = old?.categories[projectId] ?? [];
    if (!old || list.some((c) => c.id === category.id)) return old;
    return {
      ...old,
      categories: { ...old.categories, [projectId]: [...list, category] },
    };
  });
}

/** Le pendant pour un objectif fraîchement créé — mêmes deux caches que
 *  {@link patchObjectiveEverywhere}, pour la même raison. */
export function insertObjectiveEverywhere(
  queryClient: QueryClient,
  projectId: string,
  objective: Objective
): void {
  queryClient.setQueryData<Objective[]>(objectivesKey(projectId), (old) =>
    old && !old.some((o) => o.id === objective.id) ? [...old, objective] : old
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) => {
    // Même remarque que pour les catégories : premier objectif d'un projet =
    // pas encore de tranche.
    const list = old?.objectives[projectId] ?? [];
    if (!old || list.some((o) => o.id === objective.id)) return old;
    return {
      ...old,
      objectives: { ...old.objectives, [projectId]: [...list, objective] },
    };
  });
}

export function patchObjectiveEverywhere(
  queryClient: QueryClient,
  projectId: string,
  objectiveId: string,
  patch: Partial<Objective>
): void {
  const apply = (o: Objective) => (o.id === objectiveId ? { ...o, ...patch } : o);
  queryClient.setQueryData<Objective[]>(objectivesKey(projectId), (old) =>
    old?.map(apply)
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) => {
    const list = old?.objectives[projectId];
    if (!old || !list) return old;
    return {
      ...old,
      objectives: { ...old.objectives, [projectId]: list.map(apply) },
    };
  });
}
