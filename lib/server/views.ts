import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_EFFORTS,
} from "@/lib/issue-validation";
import { ME_ASSIGNEE } from "@/lib/view-filter";
import type { ViewFilters, ViewSort, ViewDisplay } from "@/lib/types";

/**
 * Shared saved-view core (create + update + baseline seeding), used by
 * POST /api/projects/[id]/views, POST /api/me/views, PATCH /api/views/[id]
 * and the assistant tools.
 *
 * Access is enforced HERE (the writes bypass RLS), replicating the views RLS
 * policies: the actor must access the project, and a personal view (user_id
 * not null) is only visible/editable by its owner — anything else is reported
 * as not found, the same signal RLS invisibility gives. Shared views
 * (user_id null) are editable by any member (open v1 governance). Global views
 * (project_id null) are always personal.
 *
 * The kind='my' system view is locked: name and filters.assignee (pinned to
 * ["@me"]) can never change, and it is never deletable.
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
        | "nameRequired"
        | "invalidSort"
        | "noFieldsToUpdate"
        | "projectNotFound"
        | "viewNotFound"
        | "systemViewLocked"
        | "databaseError";
      /** Verbatim DB message already meant for the user. */
      rawMessage?: string;
    };

/** Exported: Numo announces exactly these sorts in its tool schemas
 (lib/server/assistant/tools.ts), rather than maintaining a second copy. */
export const VIEW_SORTS: readonly ViewSort[] = ["manual", "priority", "created", "updated", "due"];

// Terminals MIN-118: the name of a view remains short (truncated beyond), a filter does not
// never reference more ids than that, and an id (uuid or sentinel "@me") either.
const MAX_NAME_LENGTH = 200;
const MAX_FILTER_VALUES = 100;
const MAX_ID_LENGTH = 100;

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
  if (kept.length > MAX_FILTER_VALUES) {
    invalid.push(`filters.${key}: capped to ${MAX_FILTER_VALUES} values`);
  }
  return kept.slice(0, MAX_FILTER_VALUES);
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
    if ((typeof v === "string" && v.length <= MAX_ID_LENGTH) || v === null) kept.push(v);
    else dropped.push(v);
  }
  if (dropped.length > 0) {
    invalid.push(
      `filters.${key}: dropped invalid value(s) ${dropped
        .map((v) => JSON.stringify(v))
        .join(", ")} (expected id strings or null)`
    );
  }
  if (kept.length > MAX_FILTER_VALUES) {
    invalid.push(`filters.${key}: capped to ${MAX_FILTER_VALUES} values`);
  }
  return kept.slice(0, MAX_FILTER_VALUES);
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
    if (typeof v === "string" && v.length <= MAX_ID_LENGTH) kept.push(v);
    else dropped.push(v);
  }
  if (dropped.length > 0) {
    invalid.push(
      `filters.${key}: dropped invalid value(s) ${dropped
        .map((v) => JSON.stringify(v))
        .join(", ")} (expected id strings)`
    );
  }
  if (kept.length > MAX_FILTER_VALUES) {
    invalid.push(`filters.${key}: capped to ${MAX_FILTER_VALUES} values`);
  }
  return kept.slice(0, MAX_FILTER_VALUES);
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
          case "integration": {
            const kept = keepIdOrNullValues(key, value, invalid);
            if (kept) filters.integration = kept;
            break;
          }
          case "project": {
            // Only meaningful on global views (a project board is single-project).
            const kept = keepIdValues(key, value, invalid);
            if (kept) filters.project = kept;
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
        else if (key === "hideRecurring") display.hideRecurring = Boolean(value);
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
  /** null = global (cross-project) view — always personal. */
  projectId: string | null;
  actorId: string;
  input: Record<string, unknown>;
}): Promise<ViewResult> {
  const name =
    typeof input.name === "string" ? input.name.trim().slice(0, MAX_NAME_LENGTH) : "";
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

  if (projectId !== null) {
    const access = await getProjectAccess(actorId, projectId);
    if (!access) {
      return { ok: false, status: 404, errorKey: "projectNotFound" };
    }
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("views")
    .insert({
      project_id: projectId,
      // Project views are shared (NULL) unless explicitly personal; global
      // views are always the caller's own.
      user_id: projectId === null || input.personal === true ? actorId : null,
      kind: "custom", // the system view is only ever seeded, never created
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
    updates.name = name.slice(0, MAX_NAME_LENGTH);
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
    .select("id, project_id, user_id, kind")
    .eq("id", viewId)
    .maybeSingle();
  if (!view) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }
  // A personal view is only its owner's (RLS parity: invisible to others).
  if (view.user_id && view.user_id !== actorId) {
    return { ok: false, status: 404, errorKey: "viewNotFound" };
  }
  // Global views (project_id null) are personal: the ownership check above
  // is the whole access rule.
  if (view.project_id !== null) {
    const access = await getProjectAccess(actorId, view.project_id as string);
    if (!access) {
      return { ok: false, status: 404, errorKey: "viewNotFound" };
    }
  }

  if (view.kind === "my") {
    // System view: the name never changes…
    if ("name" in updates) {
      return { ok: false, status: 400, errorKey: "systemViewLocked" };
    }
    // …and the assignee filter is pinned to the dynamic "@me". Forgiving:
    // the rest of the filters payload is kept, the caller is just told.
    if ("filters" in updates) {
      const filters = updates.filters as ViewFilters;
      const wanted = JSON.stringify(filters.assignee ?? null);
      if (wanted !== JSON.stringify([ME_ASSIGNEE])) {
        invalid.push(
          `filters.assignee: locked to ["${ME_ASSIGNEE}"] on the system view, overridden`
        );
      }
      filters.assignee = [ME_ASSIGNEE];
    }
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

/**
 * Idempotent baseline seeding, called from the GET list handlers (one code
 * path that also covers Numo/MCP callers and members joining later):
 * - the caller's kind='my' system view ("My tickets"), if missing;
 * - the default view ("All") when the scope has no custom view at all
 * (bootstrap only — the UI forbids deleting the last custom view).
 * projectId null = the global (cross-project) scope, where both are personal.
 * Failures are logged, never thrown: listing views must not break on a seed.
 */
// (project,user) peers already reconciled in this instance. Baseline views
// (“My tickets” system + default “All”) are never deleted once
// times created, so once we have checked/seeded them for a pair, the 2
// SELECT controls are useless on all subsequent loads — and
// `GET /views` is on the critical path of each board. Lifetime memo from
// process (a cold start rechecks once), placed ONLY on a clean run.
const seededBaselines = new Set<string>();

export async function ensureBaselineViews({
  projectId,
  userId,
  systemViewName,
  defaultViewName,
}: {
  projectId: string | null;
  userId: string;
  systemViewName: string;
  defaultViewName: string;
}): Promise<void> {
  const memoKey = `${projectId ?? "global"}:${userId}`;
  if (seededBaselines.has(memoKey)) return;
  const service = getServiceClient();
  // A reading hitch leaves the pair unmemorized → retry at the next GET.
  let clean = true;

  let systemQuery = service
    .from("views")
    .select("id")
    .eq("kind", "my")
    .eq("user_id", userId);
  systemQuery =
    projectId === null
      ? systemQuery.is("project_id", null)
      : systemQuery.eq("project_id", projectId);
  const { data: systemRow, error: systemReadError } = await systemQuery.maybeSingle();
  if (systemReadError) {
    console.error("[views] system view lookup failed:", systemReadError.message);
    clean = false;
  } else if (!systemRow) {
    const { error } = await service.from("views").insert({
      project_id: projectId,
      user_id: userId,
      kind: "my",
      name: systemViewName,
      filters: { assignee: [ME_ASSIGNEE] },
      sort: "manual",
      display: {},
      position: -1, // API consumers list it first; the UI orders pills itself
    });
    // 23505 = a concurrent GET won the seed race (partial unique index) — fine.
    if (error && error.code !== "23505") {
      console.error("[views] system view seed failed:", error.message);
    }
  }

  let customQuery = service
    .from("views")
    .select("id", { count: "exact", head: true })
    .eq("kind", "custom");
  customQuery =
    projectId === null
      ? customQuery.is("project_id", null).eq("user_id", userId)
      : customQuery.eq("project_id", projectId).or(`user_id.is.null,user_id.eq.${userId}`);
  const { count, error: countError } = await customQuery;
  if (countError) {
    console.error("[views] custom views count failed:", countError.message);
    return; // not memorized: we will check again at the next GET
  }
  if (!count) {
    const { error } = await service.from("views").insert({
      project_id: projectId,
      user_id: projectId === null ? userId : null, // project default = shared
      kind: "custom",
      name: defaultViewName,
      filters: {},
      sort: "manual",
      display: {},
    });
    if (error) {
      console.error("[views] default view seed failed:", error.message);
      clean = false;
    }
  }

  // Baseline confirmed/sown without a hitch → we skip the checks next time.
  if (clean) seededBaselines.add(memoKey);
}
