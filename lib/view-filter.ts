import {
  STATUSES,
  isClosedStatus,
  type IssueStatus,
  type StatusMeta,
} from "./issue-constants";
import { calendarDaysBetween, isDueDateOverdue, parseDueDate } from "./due-date";
import type { Issue, IssueRelation, ViewConfig, ViewSort } from "./types";

/** Dynamic assignee filter value: "assigned to me", resolved at filter time
    to the viewing user (on public shares: to the view owner). */
export const ME_ASSIGNEE = "@me";

export const DEFAULT_CONFIG: ViewConfig = {
  filters: {},
  sort: "smart",
  display: {},
};

/** Pin a config's assignee filter to ["@me"] — the invariant of the kind='my'
    system view. Every config write while that view is active goes through
    here, so a save can never unlock it. */
export function lockToMe(config: ViewConfig): ViewConfig {
  const assignee = config.filters.assignee;
  if (assignee?.length === 1 && assignee[0] === ME_ASSIGNEE) return config;
  return { ...config, filters: { ...config.filters, assignee: [ME_ASSIGNEE] } };
}

/** Is a config equivalent to the empty default? */
export function isDefaultConfig(config: ViewConfig): boolean {
  const f = config.filters;
  const empty =
    !f.status?.length &&
    !f.priority?.length &&
    !f.assignee?.length &&
    !f.effort?.length;
  return (
    empty &&
    config.sort === "smart" &&
    !config.display.hideDone &&
    !config.display.hideRecurring
  );
}

/** The config a saved view encodes. */
export function viewConfigOf(view: {
  filters: ViewConfig["filters"];
  sort: ViewSort;
  display: ViewConfig["display"];
}): ViewConfig {
  return {
    filters: view.filters ?? {},
    sort: view.sort ?? "smart",
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
    project: norm(f.project),
    sort: c.sort,
    hideDone: !!c.display.hideDone,
    hideRecurring: !!c.display.hideRecurring,
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
  if (f.project?.length) n++;
  if (config.display.hideDone) n++;
  if (config.display.hideRecurring) n++;
  return n;
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** Context the "smart" sort needs on top of the issue rows themselves. */
export type SmartSortContext = {
  /** Stored relation rows — a "blocks" edge lifts the blocking ticket. */
  relations?: IssueRelation[];
  /** Issue id → status: a closed target is no longer blocked, a resolved
      blocker no longer earns its boost. */
  statusById?: Map<string, IssueStatus>;
  /** Frozen "now", so a comparator stays stable across a drag gesture.
      Defaults to Date.now() at comparator creation. */
  now?: number;
};

/** How many priority tiers each smart criterion lifts an issue (in
    PRIORITY_ORDER units: one tier = one step between two priorities). */
const BLOCKS_BOOST = 1.5;
const DUE_OVERDUE_BOOST = 2;
const DUE_3_DAYS_BOOST = 1.5;
const DUE_WEEK_BOOST = 1;
const DUE_FORTNIGHT_BOOST = 0.5;

/** Priority tiers an issue's due date buys back: overdue counts double,
    then it fades over a fortnight. */
function dueBoost(due: string | null | undefined, now: number): number {
  const d = parseDueDate(due);
  if (!d) return 0;
  if (isDueDateOverdue(d, now)) return DUE_OVERDUE_BOOST;
  const days = calendarDaysBetween(new Date(now), d);
  if (days <= 3) return DUE_3_DAYS_BOOST;
  if (days <= 7) return DUE_WEEK_BOOST;
  if (days <= 14) return DUE_FORTNIGHT_BOOST;
  return 0;
}

/** Ids of open issues that block at least one ticket still open — a resolved
    blocker no longer actively blocks, so it keeps no boost. */
function blockingIds(
  relations: IssueRelation[] | undefined,
  statusById: Map<string, IssueStatus> | undefined
): Set<string> {
  const ids = new Set<string>();
  if (!relations?.length) return ids;
  for (const r of relations) {
    if (r.type !== "blocks") continue;
    const target = statusById?.get(r.target_id);
    if (target === undefined || isClosedStatus(target)) continue;
    const source = statusById?.get(r.source_id);
    if (source !== undefined && isClosedStatus(source)) continue;
    ids.add(r.source_id);
  }
  return ids;
}

/** Sooner due date first, undated last — the tie-break between two issues
    whose smart ranks landed equal. */
function dueTiebreak(a: Issue, b: Issue): number {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

/**
 * The "smart" order: priority first, but imminent due dates and open "blocks"
 * relations buy back priority tiers — a medium ticket due tomorrow or blocking
 * work passes an undated high. Ties read the due date, then the manual
 * position. Without a context (no relations known), it degrades to the
 * priority arrangement plus the due-date boosts.
 */
export function smartIssueComparator(
  ctx: SmartSortContext = {}
): (a: Issue, b: Issue) => number {
  const now = ctx.now ?? Date.now();
  const blockers = blockingIds(ctx.relations, ctx.statusById);
  return (a, b) => {
    const rankA =
      PRIORITY_ORDER[a.priority] -
      (dueBoost(a.due_date, now) + (blockers.has(a.id) ? BLOCKS_BOOST : 0));
    const rankB =
      PRIORITY_ORDER[b.priority] -
      (dueBoost(b.due_date, now) + (blockers.has(b.id) ? BLOCKS_BOOST : 0));
    return rankA - rankB || dueTiebreak(a, b) || a.position - b.position;
  };
}

/** Comparator for ordering issues WITHIN a column. "manual" = the position field. */
export function issueComparator(
  sort: ViewSort,
  smart?: SmartSortContext
): (a: Issue, b: Issue) => number {
  switch (sort) {
    case "smart":
      return smartIssueComparator(smart);
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

/** Apply a view's filters. "@me" in the assignee filter resolves to
    ctx.myUserId (null → stays unresolved and matches nothing — safe). */
export function filterIssues(
  issues: Issue[],
  config: ViewConfig,
  ctx: { myUserId: string | null }
): Issue[] {
  const f = config.filters;
  const assignee = f.assignee?.map((v) =>
    v === ME_ASSIGNEE ? (ctx.myUserId ?? ME_ASSIGNEE) : v
  );
  return issues.filter((i) => {
    if (config.display.hideDone && i.status === "done") return false;
    // MIN-136: maintenance that comes back every week is not what we
    // comes to read on a board. Only the LIVE ticket of a series bears the
    // cadence — past occurrences remain visible.
    if (config.display.hideRecurring && i.recurrence) return false;
    if (f.status?.length && !f.status.includes(i.status)) return false;
    if (f.priority?.length && !f.priority.includes(i.priority)) return false;
    if (assignee?.length && !assignee.includes(i.assignee_id)) return false;
    if (f.effort?.length && (i.effort === null || !f.effort.includes(i.effort)))
      return false;
    if (f.category?.length && !f.category.some((c) => i.category_ids.includes(c)))
      return false;
    if (f.objective?.length && !f.objective.includes(i.objective_id)) return false;
    if (f.integration?.length && !f.integration.includes(i.integration_id ?? null))
      return false;
    if (f.project?.length && !f.project.includes(i.project_id)) return false;
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
