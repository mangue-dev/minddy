"use client";

// The application's pending write registers (MIN-156), and the cache helpers
// built on them.
//
// Only two registers: issues and objectives, the two entities an edit patches
// locally, and so the two a fetch response that left too early can undo.
// DERIVED views (["me","summary"], ["stats"]) stay out: their list membership
// is computed in SQL, and patching a status there without recomputing the
// membership would mislead more than it corrects. The realtime bridge keeps
// refreshing them.
//
// This module sits above the pure register (pending-writes.ts) and react-query:
// it, not the hooks, knows every place an issue row is copied to — the project
// cache, the aggregate board and the palette index.

import type { QueryClient } from "@tanstack/react-query";
import { createPendingWrites } from "./pending-writes";
import { ALL_ISSUES_KEY, GLOBAL_BOARD_KEY, categoriesKey, issueRelationsKey, issuesKey, objectivesKey } from "../query-keys";
import { patchSearchIndexIssue } from "../use-search-index";
import type {
  Category,
  GlobalBoardResponse,
  Issue,
  IssueRelation,
  IssueUpdateInput,
  Objective,
  SearchIndexIssue,
} from "../types";


export const issueWrites = createPendingWrites<Issue>();
export const objectiveWrites = createPendingWrites<Objective>();

/**
 * A response scoped to ONE project must never receive another project's row.
 *
 * The register is global: a card created from the cross-project board does not
 * know which list will read it, and `apply` adds every pending insert to
 * whatever list it is given. Without this rescoping, a creation still in flight
 * in project A was added to project B's response — a hover preload or a refetch
 * of B during the POST was enough to show A's card on B's board. Patches and
 * removals name their row by id, so they cannot land in the wrong list.
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
 * Same overlay on the aggregate board. It carries TWO slices an edit patches
 * locally: its issues, and its per-project copy of the objectives — the card
 * chips, the toolbar's "Objective" facet and the issue panel's picker read that
 * copy, not `["objectives", pid]`. Without it in the overlay, a
 * `/api/me/board` response that left before an objective's PATCH replayed its
 * old name (or color) on `/all`, as it did for issues.
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
 * An issue row as it is ALREADY cached, looked up in both caches that carry
 * it. The project cache first: it is the richest (only it carries
 * `resource_count`).
 *
 * Used to decide what to do with a row from elsewhere — complete it or add it
 * (lib/optimistic/remote-echo.ts).
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

interface CachedRows {
  rows: Issue[];
  /** Shown on screen: realtime refetches it, so it is current. */
  observed: boolean;
  invalidated: boolean;
  updatedAt: number;
}

/**
 * The issue caches a writer can read, freshest first. A project list left
 * behind stays cached after its board unmounts; realtime then only marks it
 * invalidated, while the board on screen is refetched. Reading the first hit
 * would hand a writer that outdated row (and its assignee, cycle or undo
 * snapshot).
 */
function cachedRowsByFreshness(queryClient: QueryClient, projectId?: string): CachedRows[] {
  const cache = queryClient.getQueryCache();
  const lists = projectId
    ? [cache.find({ queryKey: issuesKey(projectId), exact: true })]
    : cache.findAll({ queryKey: ALL_ISSUES_KEY });
  const sources: CachedRows[] = [];
  for (const query of lists) {
    if (!query || !Array.isArray(query.state.data)) continue;
    sources.push({
      rows: query.state.data as Issue[],
      observed: query.getObserversCount() > 0,
      invalidated: query.state.isInvalidated,
      updatedAt: query.state.dataUpdatedAt,
    });
  }
  const board = cache.find<GlobalBoardResponse>({ queryKey: GLOBAL_BOARD_KEY, exact: true });
  const boardRows = board?.state.data?.issues;
  if (board && boardRows) {
    sources.push({
      rows: projectId ? boardRows.filter((i) => i.project_id === projectId) : boardRows,
      observed: board.getObserversCount() > 0,
      invalidated: board.state.isInvalidated,
      updatedAt: board.state.dataUpdatedAt,
    });
  }
  return sources.toSorted(
    (a, b) =>
      Number(b.observed) - Number(a.observed) ||
      Number(a.invalidated) - Number(b.invalidated) ||
      b.updatedAt - a.updatedAt
  );
}

/**
 * An issue row by id alone, from the freshest cache that carries it. Writers
 * resolve the issue's project from the row itself, so every surface calls
 * them the same way whatever project the card belongs to.
 */
export function findIssueAnywhere(
  queryClient: QueryClient,
  issueId: string
): Issue | undefined {
  for (const { rows } of cachedRowsByFreshness(queryClient)) {
    const hit = rows.find((i) => i.id === issueId);
    if (hit) return hit;
  }
  return undefined;
}

/** A project's cached issues: its own cache, else its rows on the aggregate board. */
export function cachedProjectIssues(
  queryClient: QueryClient,
  projectId: string
): Issue[] {
  return (
    queryClient.getQueryData<Issue[]>(issuesKey(projectId)) ??
    queryClient
      .getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)
      ?.issues.filter((i) => i.project_id === projectId) ??
    []
  );
}

/** Cached relation rows touching an issue, from its project cache and the aggregate board. */
export function cachedIssueRelations(
  queryClient: QueryClient,
  projectId: string,
  issueId: string
): IssueRelation[] {
  const rows = new Map<string, IssueRelation>();
  const sources = [
    queryClient.getQueryData<IssueRelation[]>(issueRelationsKey(projectId)) ?? [],
    queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.relations ?? [],
  ];
  for (const list of sources) {
    for (const r of list) {
      if (r.source_id === issueId || r.target_id === issueId) rows.set(r.id, r);
    }
  }
  return [...rows.values()];
}

/**
 * What an update writes into cached issue rows: everything but the editor
 * document, which is not part of the issue (MIN-728) and has its own cache
 * (lib/use-rich-document.ts).
 */
export function issueCachePatch(patch: IssueUpdateInput): Partial<Issue> {
  const { description_doc: _document, ...fields } = patch;
  return fields as Partial<Issue>;
}

/**
 * Optimistic patch of an issue EVERYWHERE its row is copied: its project
 * cache, the cross-project board and the palette index. Shared by the write
 * layer and the undo replays.
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

/** Adds a card to both issue caches (never twice). */
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
 * Writes the authoritative server row into the same caches instead of
 * invalidating them: the counterpart of the optimistic patch once the PATCH
 * returns. The server side effects (self-assignment, completed_at, leaving the
 * cycle) arrive without refetching an aggregate route that takes seconds.
 *
 * Also on the creation POST's return, for the same reason: the card already
 * carries the row's id (lib/optimistic-issue.ts), so nothing is replaced — the
 * final number, position and the assignee Smart Assign chose land on it field
 * by field, and what the server row does not carry (`resource_count`) survives.
 */
export function mergeServerIssue(
  queryClient: QueryClient,
  projectId: string,
  issue: Issue
): void {
  patchIssueEverywhere(queryClient, projectId, issue.id, issue);
}

/**
 * A newly created category (quick add from a picker) is written to the TWO
 * caches that read it, before any refetch: its project's and the cross-project
 * board's `categories` slice. Without that, the chip the user just checked has
 * no name or color to show until the GET returns.
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
    // The slice is absent while the project has NO category (the route groups
    // rows and sets no empty key) — the very project where quick add helps most.
    const list = old?.categories[projectId] ?? [];
    if (!old || list.some((c) => c.id === category.id)) return old;
    return {
      ...old,
      categories: { ...old.categories, [projectId]: [...list, category] },
    };
  });
}

/** The counterpart for a newly created objective — the same two caches as
 * {@link patchObjectiveEverywhere}. */
export function insertObjectiveEverywhere(
  queryClient: QueryClient,
  projectId: string,
  objective: Objective
): void {
  queryClient.setQueryData<Objective[]>(objectivesKey(projectId), (old) =>
    old && !old.some((o) => o.id === objective.id) ? [...old, objective] : old
  );
  queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) => {
    // As for categories: a project's first objective has no slice yet.
    const list = old?.objectives[projectId] ?? [];
    if (!old || list.some((o) => o.id === objective.id)) return old;
    return {
      ...old,
      objectives: { ...old.objectives, [projectId]: [...list, objective] },
    };
  });
}

/**
 * An objective edit reaches its project cache AND the cross-project board's
 * copy for that project. Both are read: the side panel, the Objectives page
 * cards and a project board's banner read `["objectives", pid]`; the `/all`
 * card chips, its "Objective" facet and the issue panel's picker read
 * `["me","board"].objectives`. Before, nothing refreshed the second copy, so a
 * renamed objective kept its old name on `/all` until the next full read.
 */
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
 * A trashed or purged objective leaves the same two caches — the counterpart
 * of {@link removeIssueEverywhere}. Before, only a refetch removed an
 * objective deleted elsewhere.
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
