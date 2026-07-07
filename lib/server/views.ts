import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_EFFORTS,
} from "@/lib/issue-validation";
import type { ViewFilters, ViewSort, ViewDisplay } from "@/lib/types";

/**
 * Shared saved-view core (create + update), used by POST /api/projects/[id]/views,
 * PATCH /api/views/[id] and the assistant tools.
 *
 * Access is enforced HERE (the writes bypass RLS), replicating the views RLS
 * policies: the actor must access the project, and a personal view (user_id
 * not null) is only visible/editable by its owner — anything else is reported
 * as not found, the same signal RLS invisibility gives. Shared views
 * (user_id null) are editable by any member (open v1 governance).
 */
export type ViewResult =
  | {
      ok: true;
      view: Record<string, unknown>;
      /** What sanitizeViewConfig dropped/coerced — callers can surface it. */
      invalid: string[];
    }
  | {
      ok: false;
      status: number;
      /** Key into the ApiErrors i18n namespace (mutually exclusive with rawMessage). */
      errorKey?:
        | "invalidTab"
        | "nameRequired"
        | "invalidSort"
        | "noFieldsToUpdate"
        | "projectNotFound"
        | "viewNotFound"
        | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

const VIEW_SORTS: readonly ViewSort[] = ["manual", "priority", "created", "updated", "due"];

const isViewSort = (v: unknown): v is ViewSort =>
  typeof v === "string" && (VIEW_SORTS as readonly string[]).includes(v);

/** Keep only allowed enum values; report anything dropped. */
function keepEnumValues<T extends string>(
  key: string,
  raw: unknown,
  allowed: readonly T[],
  invalid: string[]
): T[] | undefined {
  if (!Array.isArray(raw)) {
    invalid.push(`filters.${key}: expected an array, dropped`);
    return undefined;
  }
  const kept: T[] = [];
  const dropped: unknown[] = [];
  for (const v of raw) {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) kept.push(v as T);
    else dropped.push(v);
  }
  if (dropped.length > 0) {
    invalid.push(
      `filters.${key}: dropped invalid value(s) ${dropped
        .map((v) => JSON.stringify(v))
        .join(", ")} (allowed: ${allowed.join(", ")})`
    );
  }
  return kept;
}

/** Keep id strings — and null, which means "unassigned"/"no objective". */
function keepIdOrNullValues(
  key: string,
  raw: unknown,
  invalid: string[]
): (string | null)[] | undefined {
  if (!Array.isArray(raw)) {
    invalid.push(`filters.${key}: expected an array, dropped`);
    return undefined;
  }
  const kept: (string | null)[] = [];
  const dropped: unknown[] = [];
  for (const v of raw) {
    if (typeof v === "string" || v === null) kept.push(v);
    else dropped.push(v);
  }
  if (dropped.length > 0) {
    invalid.push(
      `filters.${key}: dropped invalid value(s) ${dropped
        .map((v) => JSON.stringify(v))
        .join(", ")} (expected id strings or null)`
    );
  }
  return kept;
}

/** Keep id strings only. */
function keepIdValues(key: string, raw: unknown, invalid: string[]): string[] | undefined {
  if (!Array.isArray(raw)) {
    invalid.push(`filters.${key}: expected an array, dropped`);
    return undefined;
  }
  const kept: string[] = [];
  const dropped: unknown[] = [];
  for (const v of raw) {
    if (typeof v === "string") kept.push(v);
    else dropped.push(v);
  }
  if (dropped.length > 0) {
    invalid.push(
      `filters.${key}: dropped invalid value(s) ${dropped
        .map((v) => JSON.stringify(v))
        .join(", ")} (expected id strings)`
    );
  }
  return kept;
}

/**
 * Validate an untrusted filters/sort/display triple against the view schema:
 * unknown keys and invalid values are STRIPPED (never stored), an unknown sort
 * falls back to "manual", and display.hideDone is coerced to a boolean. Every
 * drop/fallback is described in `invalid` so an AI caller can self-correct.
 * Valid payloads pass through unchanged.
 */
export function sanitizeViewConfig(input: {
  filters?: unknown;
  sort?: unknown;
  display?: unknown;
}): { filters: ViewFilters; sort: ViewSort; display: ViewDisplay; invalid: string[] } {
  const invalid: string[] = [];

  const filters: ViewFilters = {};
  if (input.filters !== undefined && input.filters !== null) {
    if (typeof input.filters === "object" && !Array.isArray(input.filters)) {
      for (const [key, value] of Object.entries(input.filters as Record<string, unknown>)) {
        switch (key) {
          case "status": {
            const kept = keepEnumValues(key, value, ISSUE_STATUSES, invalid);
            if (kept) filters.status = kept;
            break;
          }
          case "priority": {
            const kept = keepEnumValues(key, value, ISSUE_PRIORITIES, invalid);
            if (kept) filters.priority = kept;
            break;
          }
          case "effort": {
            const kept = keepEnumValues(key, value, ISSUE_EFFORTS, invalid);
            if (kept) filters.effort = kept;
            break;
          }
          case "assignee": {
            const kept = keepIdOrNullValues(key, value, invalid);
            if (kept) filters.assignee = kept;
            break;
          }
          case "objective": {
            const kept = keepIdOrNullValues(key, value, invalid);
            if (kept) filters.objective = kept;
            break;
          }
          case "category": {
            const kept = keepIdValues(key, value, invalid);
            if (kept) filters.category = kept;
            break;
          }
          default:
            invalid.push(`filters.${key}: unknown key, dropped`);
        }
      }
    } else {
      invalid.push("filters: expected an object, dropped");
    }
  }

  let sort: ViewSort = "manual";
  if (isViewSort(input.sort)) {
    sort = input.sort;
  } else if (input.sort !== undefined && input.sort !== null) {
    invalid.push(
      `sort: ${JSON.stringify(input.sort)} is not one of ${VIEW_SORTS.join(", ")}; fell back to "manual"`
    );
  }

  const display: ViewDisplay = {};
  if (input.display !== undefined && input.display !== null) {
    if (typeof input.display === "object" && !Array.isArray(input.display)) {
      for (const [key, value] of Object.entries(input.display as Record<string, unknown>)) {
        if (key === "hideDone") display.hideDone = Boolean(value);
        else invalid.push(`display.${key}: unknown key, dropped`);
      }
    } else {
      invalid.push("display: expected an object, dropped");
    }
  }

  return { filters, sort, display, invalid };
}

export async function createView({
  projectId,
  actorId,
  input,
}: {
  projectId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<ViewResult> {
  const onglet = input.onglet;
  if (onglet !== "my" && onglet !== "all") {
    return { ok: false, status: 400, errorKey: "invalidTab" };
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    return { ok: false, status: 400, errorKey: "nameRequired" };
  }
  // Same forgiving behavior as the route: an unknown sort falls back to
  // "manual" (reported in `invalid`), bad filter/display parts are stripped.
  const { filters, sort, display, invalid } = sanitizeViewConfig({
    filters: input.filters,
    sort: input.sort,
    display: input.display,
  });

  const access = await getProjectAccess(actorId, projectId);
  if (!access) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("views")
    .insert({
      project_id: projectId,
      onglet,
      // 'my' → personal (owned by me); 'all' → shared (NULL).
      user_id: onglet === "my" ? actorId : null,
      name,
      filters,
      sort,
      display,
      // position keeps its column default (0), like the route always did.
    })
    .select("*")
    .single();

  if (error) {
    console.error("[views] create failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, view: data, invalid };
}

export async function updateView({
  viewId,
  actorId,
  input,
}: {
  viewId: string;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<ViewResult> {
  const updates: Record<string, unknown> = {};
  const invalid: string[] = [];

  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name) {
      return { ok: false, status: 400, errorKey: "nameRequired" };
    }
    updates.name = name;
  }
  if ("filters" in input || "display" in input) {
    const sanitized = sanitizeViewConfig({ filters: input.filters, display: input.display });
    if ("filters" in input) updates.filters = sanitized.filters;
    if ("display" in input) updates.display = sanitized.display;
    invalid.push(...sanitized.invalid);
  }
  if ("sort" in input) {
    // Unlike create, an explicit sort update must be valid (hard 400).
    if (!isViewSort(input.sort)) {
      return { ok: false, status: 400, errorKey: "invalidSort" };
    }
    updates.sort = input.sort;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const service = getServiceClient();

  const { data: view } = await service
    .from("views")
    .select("id, project_id, user_id")
    .eq("id", viewId)
    .maybeSingle();
  if (!view) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }
  // A personal view is only its owner's (RLS parity: invisible to others).
  if (view.user_id && view.user_id !== actorId) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }
  const access = await getProjectAccess(actorId, view.project_id as string);
  if (!access) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }

  const { data, error } = await service
    .from("views")
    .update(updates)
    .eq("id", viewId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[views] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }
  return { ok: true, view: data, invalid };
}
