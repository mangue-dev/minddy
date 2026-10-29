/**
 * The admin Costs tab's arithmetic (MIN-829): filters, the period and the one
 * before it, the charts' series and the top lists, all derived from the
 * ledger aggregates of `/api/admin/finance` (`AdminCostRow`). Pure functions,
 * tested; the screen only draws them.
 */
import { USAGE_SEGMENTS } from "@/lib/billing-plans";
import type { AdminCostRow } from "@/lib/types";

/**
 * The feature families of the Costs tab: the billing segments, plus what no
 * account pays for (the public site) and the rest. A feature keeps its billing
 * family, so the same color names the same spending on both screens.
 */
export type AdminCostGroupId =
  | "numo"
  | "routines"
  | "automations"
  | "dictation"
  | "feedback"
  | "site"
  | "other";

export const ADMIN_COST_GROUPS: AdminCostGroupId[] = [
  "numo",
  "routines",
  "automations",
  "dictation",
  "feedback",
  "site",
  "other",
];

const EXTRA_GROUPS: Record<string, AdminCostGroupId> = {
  // Billed to the person who imports or pastes, like the automations.
  import_map: "automations",
  brief_split: "automations",
  // Anonymous visitors: the instance pays.
  landing_demo: "site",
  faq_ask: "site",
};

export function costGroupOf(feature: string): AdminCostGroupId {
  const segment = USAGE_SEGMENTS.find((entry) => (entry.features as readonly string[]).includes(feature));
  return segment?.id ?? EXTRA_GROUPS[feature] ?? "other";
}

export type KeyModeFilter = "all" | "platform" | "byok";

export interface CostFilters {
  group: AdminCostGroupId | "all";
  model: string | "all";
  keyMode: KeyModeFilter;
}

export const NO_FILTERS: CostFilters = { group: "all", model: "all", keyMode: "all" };

export function filterCostRows(rows: AdminCostRow[], filters: CostFilters): AdminCostRow[] {
  return rows.filter(
    (row) =>
      (filters.group === "all" || costGroupOf(row.feature) === filters.group) &&
      (filters.model === "all" || row.model === filters.model) &&
      (filters.keyMode === "all" || row.keyMode === filters.keyMode),
  );
}

export interface CostTotals {
  costUsd: number;
  calls: number;
  tokens: number;
  /** Cached prompt tokens over prompt tokens; `null` without prompt tokens. */
  cacheHitRate: number | null;
  /** Cost per million tokens; `null` without tokens. */
  costPerMillion: number | null;
}

export function costTotals(rows: AdminCostRow[]): CostTotals {
  let costUsd = 0;
  let calls = 0;
  let prompt = 0;
  let completion = 0;
  let cached = 0;
  for (const row of rows) {
    costUsd += row.costUsd;
    calls += row.calls;
    prompt += row.promptTokens;
    completion += row.completionTokens;
    cached += row.cachedTokens;
  }
  const tokens = prompt + completion;
  return {
    costUsd,
    calls,
    tokens,
    cacheHitRate: prompt > 0 ? cached / prompt : null,
    costPerMillion: tokens > 0 ? (costUsd / tokens) * 1_000_000 : null,
  };
}

/** Relative change; `null` when the previous period had nothing to compare with. */
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Every day of the window, oldest first: a day without calls is a zero, not a hole. */
export function windowDays(startDay: string, length: number): string[] {
  const start = new Date(`${startDay}T00:00:00Z`);
  return Array.from({ length }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return isoDay(day);
  });
}

/** The rows of the window, and those of the window just before it. */
export function splitPeriods(
  rows: AdminCostRow[],
  startDay: string,
): { current: AdminCostRow[]; previous: AdminCostRow[] } {
  const current: AdminCostRow[] = [];
  const previous: AdminCostRow[] = [];
  for (const row of rows) (row.day >= startDay ? current : previous).push(row);
  return { current, previous };
}

export interface RankedEntry {
  key: string;
  costUsd: number;
  calls: number;
  tokens: number;
}

/** Totals per key, most expensive first. */
export function rankBy(rows: AdminCostRow[], keyOf: (row: AdminCostRow) => string): RankedEntry[] {
  const map = new Map<string, RankedEntry>();
  for (const row of rows) {
    const key = keyOf(row);
    const entry = map.get(key) ?? { key, costUsd: 0, calls: 0, tokens: 0 };
    entry.costUsd += row.costUsd;
    entry.calls += row.calls;
    entry.tokens += row.promptTokens + row.completionTokens;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || a.key.localeCompare(b.key));
}

/** The series key that gathers everything beyond the top entries. */
export const OTHER_SERIES = "__other__";

export interface StackedSeries {
  /** Series keys in drawing order, the “other” series last. */
  keys: string[];
  /** One entry per day: the value of each series. */
  days: Array<{ day: string; values: Record<string, number> }>;
}

/**
 * A stacked daily series: the `limit` keys that weigh most on `metric` get
 * their own color, the rest is summed under `OTHER_SERIES`.
 */
export function stackedSeries(
  rows: AdminCostRow[],
  days: string[],
  keyOf: (row: AdminCostRow) => string,
  metric: (row: AdminCostRow) => number,
  limit: number,
): StackedSeries {
  const weights = new Map<string, number>();
  for (const row of rows) weights.set(keyOf(row), (weights.get(keyOf(row)) ?? 0) + metric(row));
  const ranked = [...weights.entries()].filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, limit).map(([key]) => key);
  const keys = ranked.length > limit ? [...top, OTHER_SERIES] : top;
  const byDay = new Map(days.map((day) => [day, Object.fromEntries(keys.map((key) => [key, 0])) as Record<string, number>]));
  for (const row of rows) {
    const values = byDay.get(row.day);
    if (!values) continue;
    const key = top.includes(keyOf(row)) ? keyOf(row) : OTHER_SERIES;
    if (key in values) values[key] += metric(row);
  }
  return { keys, days: days.map((day) => ({ day, values: byDay.get(day)! })) };
}

/** One value per day, for a sparkline. */
export function dailyValues(rows: AdminCostRow[], days: string[], metric: (row: AdminCostRow) => number): number[] {
  const byDay = new Map(days.map((day) => [day, 0]));
  for (const row of rows) if (byDay.has(row.day)) byDay.set(row.day, byDay.get(row.day)! + metric(row));
  return days.map((day) => byDay.get(day)!);
}
