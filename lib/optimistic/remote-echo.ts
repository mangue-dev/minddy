"use client";

// Adoption of lines written ELSEWHERE.
//
// The real-time bridge (lib/realtime-provider.tsx) was already receiving each write
// of all my projects — but he only made an INVALIDATION of them. The ticket that
// Numo just created did not appear when the broadcast arrived: it
// appeared upon return of the refetch that it triggers, and for `/all` this refetch
// is `GET /api/me/board`, a route aggregated to several seconds (every
// tickets from all my projects, members resolved by the admin API, the
// cycle reconciliation). Hence the “it takes a few seconds to appear”
// — and the doubt: did it work?
//
// But diffusion CARRIES the line. Measured in production on 2026-08-05, probe in key
// service: the 30 columns of `issues`, values ​​identical to the character except
// what PostgREST renders, received 231 ms after the start of the INSERT — i.e. at the same
// time for the HTTP response to write itself. So there is nothing to
// wait for the server to DISPLAY it. This module translates it into writing
// cache, exactly like the return of a local PATCH (`mergeServerIssue`): the
// line is there at the millisecond, and the invalidation which follows only serves to
// reconcile what it doesn't say (related categories, number of pieces
// attached, derived views calculated in SQL).
//
// What should NOT pass through here: the echo of our OWN writing. THE
// trigger broadcast at commit, typically before the HTTP response comes back
// (measured: 4 ms before) — rewrite the then line over a second
// edition already gone would reopen the race closed by MIN-156. The appellant dismisses
// ce cas (`issueWrites` / `objectiveWrites`.wasJustWritten).

import type { QueryClient } from "@tanstack/react-query";
import {
  findCachedIssue,
  findCachedObjective,
  insertIssueEverywhere,
  insertObjectiveEverywhere,
  issueWrites,
  objectiveWrites,
  patchIssueEverywhere,
  patchObjectiveEverywhere,
  removeIssueEverywhere,
  removeObjectiveEverywhere,
} from "./issue-writes";
import {
  removeSearchIndexIssue,
  removeSearchIndexObjective,
  upsertSearchIndexIssue,
  upsertSearchIndexObjective,
} from "../use-search-index";
import type { PendingEntry, PendingWrites } from "./pending-writes";
import type {
  Issue,
  Objective,
  SearchIndexIssue,
  SearchIndexObjective,
} from "../types";

/** Payload of `realtime.broadcast_changes()`, as the bridge receives it. */
export interface RemoteChange {
  operation: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

/** The entity that an echo touches: the two that the app copies into its caches. */
type Entity = "issue" | "objective";

/** What an echo asks from caches. */
export type RemoteEcho =
  /** The broadcast line, to be completed (if you have it) or added (otherwise). */
  | { entity: Entity; kind: "upsert"; id: string; row: Record<string, unknown> }
  /** Trashed (soft delete = UPDATE `deleted_at`) or purged: the line goes away. */
  | { entity: Entity; kind: "remove"; id: string }
  /** A category link placed or removed on a ticket. */
  | { entity: "issue"; kind: "category"; id: string; categoryId: string; linked: boolean }
  | null;

function stringField(row: Record<string, unknown> | null, field: string): string | null {
  const value = row?.[field];
  return typeof value === "string" && value ? value : null;
}

/**
 * A row broadcast for a trash table: what it asks from the caches.
 *
 * A deletion is an UPDATE which sets `deleted_at` (MIN-133); the definitive purge
 * is a real DELETE. Both make the line disappear — the
 * RLS has already made it disappear from reads.
 */
function trashAwareEcho(entity: Entity, change: RemoteChange): RemoteEcho {
  const row = change.record ?? change.old_record;
  const id = stringField(row, "id");
  if (!id) return null;
  if (change.operation === "DELETE" || stringField(change.record, "deleted_at")) {
    return { entity, kind: "remove", id };
  }
  return change.record ? { entity, kind: "upsert", id, row: change.record } : null;
}

/**
 * What this echo means for caches, or `null` if it does not concern them.
 * PURE function — this is what the test locks.
 */
export function remoteEchoOf(change: RemoteChange): RemoteEcho {
  if (change.table === "issues") return trashAwareEcho("issue", change);
  if (change.table === "objectives") return trashAwareEcho("objective", change);
  if (change.table === "issue_categories") {
    const row = change.record ?? change.old_record;
    const id = stringField(row, "issue_id");
    const categoryId = stringField(row, "category_id");
    if (!id || !categoryId) return null;
    return {
      entity: "issue",
      kind: "category",
      id,
      categoryId,
      linked: change.operation !== "DELETE",
    };
  }
  return null;
}

/**
 * Registers the write to the pending writes register, ALREADY confirmed.
 *
 * Without this, a response from `/api/me/board` that left before broadcast and arrived
 * afterwards would rewrite the cache without the ticket — it would appear and then
 * would disappear for a few more seconds. The register contract is
 * temporal: the entry applies to responses left before this instant, then is
 * purged by itself (30 s).
 *
 * `settle` WITHOUT a server line, voluntarily: the fingerprint that it would memorize
 * otherwise would pass off a subsequent broadcast as an echo of a write to us,
 * and make it skip the invalidation that reconciles what the line doesn't say.
 */
function remember<T extends { id: string }>(
  registry: PendingWrites<T>,
  entry: PendingEntry<T>
): void {
  registry.settle(registry.begin(entry));
}

/**
 * The index row of the palette, field by field.
 *
 * NOT a `...row`: the index carries up to 4000 rows, it is kept off the
 * disk for this reason (lib/query-provider.tsx), and a row of complete ticket
 * would drag its description and plan (up to 64 KB). The route
 * only selects these columns — we don't put any others.
 */
function indexIssueOf(row: Record<string, unknown>): SearchIndexIssue {
  const full = row as unknown as SearchIndexIssue;
  return {
    id: full.id,
    project_id: full.project_id,
    number: full.number,
    title: full.title,
    status: full.status,
    priority: full.priority,
    effort: full.effort,
    assignee_id: full.assignee_id,
    objective_id: full.objective_id,
    updated_at: full.updated_at,
  };
}

function indexObjectiveOf(row: Record<string, unknown>): SearchIndexObjective {
  const full = row as unknown as SearchIndexObjective;
  return {
    id: full.id,
    project_id: full.project_id,
    name: full.name,
    status: full.status,
    color: full.color,
  };
}

/** An objective written elsewhere, in its three caches. */
function adoptObjective(
  queryClient: QueryClient,
  projectId: string,
  echo: Extract<RemoteEcho, { kind: "upsert" | "remove" }>
): void {
  if (echo.kind === "remove") {
    removeObjectiveEverywhere(queryClient, projectId, echo.id);
    removeSearchIndexObjective(queryClient, echo.id);
    remember(objectiveWrites, { kind: "remove", id: echo.id });
    return;
  }
  upsertSearchIndexObjective(queryClient, indexObjectiveOf(echo.row));
  const objective = echo.row as unknown as Objective;
  if (findCachedObjective(queryClient, projectId, echo.id)) {
    patchObjectiveEverywhere(queryClient, projectId, echo.id, objective);
    remember(objectiveWrites, { kind: "patch", id: echo.id, patch: objective });
    return;
  }
  insertObjectiveEverywhere(queryClient, projectId, objective);
  remember(objectiveWrites, { kind: "insert", row: objective });
}

/**
 * Writes in the caches the line that another client (Numo, the MCP, a
 * teammate) has just written in base, without waiting for the slightest round trip.
 *
 * `projectId` comes from the TOPIC, not from the line: it's the same project, and the
 * connecting lines (`issue_categories`) do not carry it.
 */
export function adoptRemoteRow(
  queryClient: QueryClient,
  projectId: string,
  echo: RemoteEcho
): void {
  if (!echo) return;
  if (echo.entity === "objective") {
    adoptObjective(queryClient, projectId, echo);
    return;
  }

  switch (echo.kind) {
    case "remove": {
      removeIssueEverywhere(queryClient, projectId, echo.id);
      removeSearchIndexIssue(queryClient, echo.id);
      remember(issueWrites, { kind: "remove", id: echo.id });
      return;
    }
    case "upsert": {
      const cached = findCachedIssue(queryClient, projectId, echo.id);
      // The palette index, in both cases: `patchIssueEverywhere` does not know
      // that patching a line ALREADY indexed, and a ticket that has just been created is not there
      // is by definition not.
      upsertSearchIndexIssue(queryClient, indexIssueOf(echo.row));
      if (cached) {
        // The broadcast line does NOT carry `category_ids` (nor `resource_count`):
        // these are aggregates that the route calculates. Do not cite them in the
        // patch is precisely to preserve them.
        const patch = echo.row as Partial<Issue>;
        patchIssueEverywhere(queryClient, projectId, echo.id, patch);
        remember(issueWrites, { kind: "patch", id: echo.id, patch });
        return;
      }
      // First time seeing this ticket: its category links will arrive
      // by their own broadcasts, and the refetch will carry them anyway.
      const issue = { category_ids: [], ...echo.row } as unknown as Issue;
      insertIssueEverywhere(queryClient, projectId, issue);
      remember(issueWrites, { kind: "insert", row: issue });
      return;
    }
    case "category": {
      const cached = findCachedIssue(queryClient, projectId, echo.id);
      if (!cached) return; // nothing to patch: the ticket line follows or will follow
      const current = cached.category_ids ?? [];
      const next = echo.linked
        ? current.includes(echo.categoryId)
          ? current
          : [...current, echo.categoryId]
        : current.filter((id) => id !== echo.categoryId);
      if (next === current) return;
      const patch = { category_ids: next };
      patchIssueEverywhere(queryClient, projectId, echo.id, patch);
      remember(issueWrites, { kind: "patch", id: echo.id, patch });
    }
  }
}
