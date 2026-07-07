import { STATUSES, type StatusMeta } from "./issue-constants";
import type { Issue, Onglet, ViewConfig, ViewSort } from "./types";

export const DEFAULT_CONFIG: ViewConfig = {
  filters: {},
  sort: "manual",
  display: {},
};

/** Is a config equivalent to the empty default (ignoring the implicit My filter)? */
export function isDefaultConfig(config: ViewConfig): boolean {
  const f = config.filters;
  const empty =
    !f.status?.length &&
    !f.priority?.length &&
    !f.assignee?.length &&
    !f.effort?.length;
  return empty && config.sort === "manual" && !config.display.hideDone;
}

/** The config a saved view encodes. */
export function viewConfigOf(view: {
  filters: ViewConfig["filters"];
  sort: ViewSort;
  display: ViewConfig["display"];
}): ViewConfig {
  return {
    filters: view.filters ?? {},
    sort: view.sort ?? "manual",
    display: view.display ?? {},
  };
}

/** Canonical string of a config, for change detection (order-independent). */
export function normalizeConfig(c: ViewConfig): string {
  const norm = (arr?: (string | null)[]) =>
    arr && arr.length ? [...arr].map((v) => (v === null ? "∅" : v)).sort() : undefined;
  const f = c.filters;
  return JSON.stringify({
    status: norm(f.status),
    priority: norm(f.priority),
    assignee: norm(f.assignee),
    effort: norm(f.effort),
    category: norm(f.category),
    objective: norm(f.objective),
    integration: norm(f.integration),
    sort: c.sort,
    hideDone: !!c.display.hideDone,
  });
}

export function configsEqual(a: ViewConfig, b: ViewConfig): boolean {
  return normalizeConfig(a) === normalizeConfig(b);
}

/** Count of active filter facets (for the "Filtres · N" badge). */
export function activeFilterCount(config: ViewConfig): number {
  const f = config.filters;
  let n = 0;
  if (f.status?.length) n++;
  if (f.priority?.length) n++;
  if (f.assignee?.length) n++;
  if (f.effort?.length) n++;
  if (f.category?.length) n++;
  if (f.objective?.length) n++;
  if (f.integration?.length) n++;
  if (config.display.hideDone) n++;
  return n;
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** Apply a view's filters (plus the onglet's implicit assignee=me for "my"). */
export function filterIssues(
  issues: Issue[],
  config: ViewConfig,
  ctx: { onglet: Onglet; myUserId: string | null }
): Issue[] {
  const f = config.filters;
  return issues.filter((i) => {
    if (ctx.onglet === "my" && i.assignee_id !== ctx.myUserId) return false;
    if (config.display.hideDone && i.status === "done") return false;
    if (f.status?.length && !f.status.includes(i.status)) return false;
    if (f.priority?.length && !f.priority.includes(i.priority)) return false;
    if (f.assignee?.length && !f.assignee.includes(i.assignee_id)) return false;
    if (f.effort?.length && (i.effort === null || !f.effort.includes(i.effort)))
      return false;
    if (f.category?.length && !f.category.some((c) => i.category_ids.includes(c)))
      return false;
    if (f.objective?.length && !f.objective.includes(i.objective_id)) return false;
    if (f.integration?.length && !f.integration.includes(i.integration_id ?? null))
      return false;
    return true;
  });
}

/** Which status columns to render (status filter narrows them; hideDone drops Done). */
export function visibleStatuses(config: ViewConfig): StatusMeta[] {
  let list = STATUSES;
  if (config.filters.status?.length) {
    const set = new Set(config.filters.status);
    list = list.filter((s) => set.has(s.value));
  }
  if (config.display.hideDone) {
    list = list.filter((s) => s.value !== "done");
  }
  return list;
}

/** Comparator for ordering issues WITHIN a column. "manual" = the position field. */
export function issueComparator(sort: ViewSort): (a: Issue, b: Issue) => number {
  switch (sort) {
    case "priority":
      return (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.position - b.position;
    case "created":
      return (a, b) => b.created_at.localeCompare(a.created_at); // newest first
    case "updated":
      return (a, b) => b.updated_at.localeCompare(a.updated_at);
    case "due":
      return (a, b) => {
        // Soonest first, undated last.
        if (!a.due_date && !b.due_date) return a.position - b.position;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      };
    case "manual":
    default:
      return (a, b) => a.position - b.position;
  }
}
