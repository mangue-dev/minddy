"use client";

// The application's pending write registers (MIN-156), and the
// cache helpers mounted above.
//
// Only two registers: tickets and objectives. These are both
// entities that an edition patches locally — so both that the answer of a
// fetch gone too early can undo. DERIVED views (["me","summary"],
// ["stats"]) remain outside the scope: their membership in the lists is calculated
// en SQL, y patcher un statut sans recalculer l'appartenance mentirait plus que
// It doesn't correct it. They continue to be refreshed by the real-time bridge.
//
// This module lives below the pure register (pending-writes.ts) and above
// react-query: it is he, and not the hooks, who knows where a ticket line is
// copied — the project cache, the aggregated board, the palette index.

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

/** Cache key for the aggregate cross-project board (MIN-29). He lives here instead
    that in use-global-board-query.ts (which re-exports it) so that this module
    reste importable depuis ce hook sans cycle d'import. */
export const GLOBAL_BOARD_KEY = ["me", "board"] as const;

const issuesKey = (projectId: string) => ["issues", projectId] as const;
const objectivesKey = (projectId: string) => ["objectives", projectId] as const;
const categoriesKey = (projectId: string) => ["categories", projectId] as const;

export const issueWrites = createPendingWrites<Issue>();
export const objectiveWrites = createPendingWrites<Objective>();

/**
 * A scoped response to ONE project should never receive a neighbor's line.
 *
 * The register is global: a map created from the cross-project board
 * doesn't know which list will read it, and `apply` adds any insertion in
 * waiting for the list presented to him. Without this rescoping, yet another creation
 * in flight in project A was added to the response of project B — a
 * preloading on hover or a refetch of B during POST was enough to do
 * appear the neighbor's card in his table. The `patch` and the `remove`,
 * they are designated by an id: they cannot make the wrong list.
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

/** Overlay of pending entries on a project's ticket list. */
export function applyPendingIssues(
  issues: Issue[],
  startedAt: number,
  projectId?: string
): Issue[] {
  return scopeToProject(issueWrites.apply(issues, startedAt), issues, projectId);
}

/** Overlay of pending entries on a project's objectives list. */
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
 * Same overlay on the aggregate board. It carries TWO installments as one edition
 * patches locally: its tickets, and its copy of the objectives per project — the
 * chips on the cards, the “Objective” facet of the toolbar and the
 * ticket panel selector read this, not `["objectives", pid]`.
 * Without it in the overlay, a response from `/api/me/board` left before the
 * PATCH of a lens replayed its old name (or color) on
 * `/all`, just like she did for the tickets.
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
 * The line of a ticket as it is ALREADY cached, searched in both
 * caches that carry it. The project cache first: it is the richest (it
 * seul porte `resource_count`).
 *
 * Used to decide what to do with a line from elsewhere — complete it or
 * l'ajouter (lib/optimistic/remote-issue-echo.ts).
 */
export function findCachedIssue(
  queryClient: QueryClient,
  projectId: string,
  issueId: string
): Issue | undefined {
  const fromProject = queryClient
    .getQueryData<Issue[]>(issuesKey(projectId))
    ?.find((i) => i.id === issueId);
  if (fromProject) return fromProject;
  return queryClient
    .getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)
    ?.issues.find((i) => i.id === issueId);
}

/**
 * Optimistic patch of a ticket EVERYWHERE where its line is copied: its cache
 * project, the cross-project board and the palette index. This is the version
 * shared what the undo replays were doing in their corner.
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

/** Adds a card to both ticket caches (never duplicate). */
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

/** Removes a card from both caches (creation refused, deletion). */
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
 * Writes the authoritative server line to the same caches, instead of them
 * invalidate. This is the counterpart of the optimistic patch when the PATCH returns: the effects
 * de bord serveur (auto-attribution, completed_at, sortie de cycle) arrivent
 * without costing a refetch of a route aggregated to several seconds.
 *
 * When returning from the POST of creation too, and for the same reason: the card carries
 * already the line id (lib/optimistic-issue.ts), so there is nothing to
 * replace — the final number, position and assignee that Smart Assign has
 * chosen arise on it field by field, and what the server line does not carry
 * pas (`resource_count`) survit.
 */
export function mergeServerIssue(
  queryClient: QueryClient,
  projectId: string,
  issue: Issue
): void {
  patchIssueEverywhere(queryClient, projectId, issue.id, issue);
}

/**
 * The counterpart for a goal: its project cache AND the copy that the board
 * cross-project scope for this project.
 *
 * Both, because both are read: the side panel, the cards of the
 * Objectives page and a project's board banner read
 * `["objectives", pid]` ; the chips of the `/all` cards, its facet
 * “Goal” and the goal selector on a ticket panel read
 * `["me","board"].objectives`. Nothing refreshed the second on a
 * objective editing — neither the success path, nor the real-time echo — therefore a
 * renamed objective remained displayed under its old name on the board
 * cross-project until something else reloads the road.
 */
/**
 * A newly created category (quick addition from a picker) is written
 * in the TWO caches that read it, even before the refetch: that of its
 * project and the `categories` section of the cross-project board. Without that, the pellet
 * that the user has just checked has no name or color to display
 * until the GET returns — a half-second gap on the most
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
    // Slice absent when the project had NO category (the road
    // groups the lines, it does not set an empty key) — this is precisely the
    // project where quick add is most useful.
    const list = old?.categories[projectId] ?? [];
    if (!old || list.some((c) => c.id === category.id)) return old;
    return {
      ...old,
      categories: { ...old.categories, [projectId]: [...list, category] },
    };
  });
}

/** The counterpart for a newly created lens — same two covers as
 * {@link patchObjectiveEverywhere}, for the same reason. */
export function insertObjectiveEverywhere(
  queryClient: QueryClient,
  projectId: string,
  objective: Objective
): void {
  queryClient.setQueryData<Objective[]>(objectivesKey(projectId), (old) =>
    old && !old.some((o) => o.id === objective.id) ? [...old, objective] : old
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) => {
    // Same remark as for the categories: first objective of a project =
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

/**
 * A trashed or purged objective leaves the same two caches. The counterpart of
 * {@link removeIssueEverywhere}, qui manquait : jusqu'ici seul un refetch
 * made an objective deleted elsewhere disappear.
 */
export function removeObjectiveEverywhere(
  queryClient: QueryClient,
  projectId: string,
  objectiveId: string
): void {
  const drop = (o: Objective) => o.id !== objectiveId;
  queryClient.setQueryData<Objective[]>(objectivesKey(projectId), (old) =>
    old?.filter(drop)
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) => {
    const list = old?.objectives[projectId];
    if (!old || !list) return old;
    return {
      ...old,
      objectives: { ...old.objectives, [projectId]: list.filter(drop) },
    };
  });
}

/** The objective as it is ALREADY cached — the counterpart to {@link findCachedIssue}. */
export function findCachedObjective(
  queryClient: QueryClient,
  projectId: string,
  objectiveId: string
): Objective | undefined {
  const fromProject = queryClient
    .getQueryData<Objective[]>(objectivesKey(projectId))
    ?.find((o) => o.id === objectiveId);
  if (fromProject) return fromProject;
  return queryClient
    .getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)
    ?.objectives[projectId]?.find((o) => o.id === objectiveId);
}
