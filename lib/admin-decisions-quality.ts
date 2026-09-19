import type { AdminDecisionsQualityWeek } from "@/lib/types";

/**
 * The aggregation behind the admin “AI decisions” section (MIN-567) — pure,
 * so the weighting is pinned by tests.
 *
 * The weekly view carries SUMS and COUNTS, never per-week averages: weeks of
 * very different traffic (one sample in one, hundreds in another) must weigh
 * by their counts, or the displayed latencies and cost stop being
 * per-sample figures. Every average below is therefore `sum / count` over
 * the aggregated window, computed on the applicable rows only.
 */

/** Weekly agreement is read over the last few weeks — a trend, not a flood. */
export const WEEKS_SHOWN = 6;

/** Canonical row order, then anything else by sample count. */
export const USE_CASE_ORDER = ["smart_fill", "smart_assign", "smart_triage"];

/** Use cases with a translated label; anything else shows its raw key. */
export const KNOWN_USE_CASES = new Set([...USE_CASE_ORDER, "feedback_review"]);

/** One use case's aggregate over the displayed window, ready to render. */
export interface UseCaseRow {
  useCase: string;
  samples: number;
  comparable: number;
  agreeCount: number;
  replayFailed: number;
  /** Agreement of each displayed week, oldest → newest; `null` = no data. */
  series: (number | null)[];
  /** Per-sample averages over the window; `null` when nothing was measured. */
  jevLatencyMs: number | null;
  llmLatencyMs: number | null;
  llmCost: number | null;
}

function weightedAverage(sum: number, count: number): number | null {
  return count > 0 ? sum / count : null;
}

/** Monday 00:00 UTC of the week holding `ts` — the same truncation the
 * weekly view applies (`date_trunc('week', …)`), so the calendar window the
 * dashboard builds matches the stored keys exactly. */
export function startOfUtcWeek(ts: number): number {
  const d = new Date(ts);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

export function buildUseCaseRows(
  weeks: AdminDecisionsQualityWeek[],
  now: number = Date.now()
): UseCaseRow[] {
  // The window is the CALENDAR window — the six weeks ending at the current
  // one, empty slots included (MIN-567 review): stale evidence can never
  // masquerade as "the last 6 weeks", a stalled sampling shows as dashes.
  const currentWeekStart = startOfUtcWeek(now);
  const weekKeys = Array.from({ length: WEEKS_SHOWN }, (_, i) =>
    new Date(currentWeekStart - (WEEKS_SHOWN - 1 - i) * 7 * 86_400_000).toISOString()
  );
  const inWindow = new Set(weekKeys);
  // Use cases with ANY row still list (a stalled one reads as an empty
  // window), but only the window's rows feed the totals and the series.
  const byUseCase = new Map<string, AdminDecisionsQualityWeek[]>();
  for (const week of weeks) {
    const rows = byUseCase.get(week.useCase) ?? [];
    if (inWindow.has(week.weekStart)) rows.push(week);
    byUseCase.set(week.useCase, rows);
  }
  const useCases = [
    ...USE_CASE_ORDER.filter((useCase) => byUseCase.has(useCase)),
    ...[...byUseCase.keys()]
      .filter((useCase) => !USE_CASE_ORDER.includes(useCase))
      .sort(
        (a, b) =>
          (byUseCase.get(b)?.length ?? 0) - (byUseCase.get(a)?.length ?? 0) ||
          a.localeCompare(b),
      ),
  ];
  return useCases.map((useCase) => {
    const rows = byUseCase.get(useCase) ?? [];
    const byWeek = new Map(rows.map((row) => [row.weekStart, row]));
    const series = weekKeys.map((weekStart) => {
      const row = byWeek.get(weekStart);
      if (!row || row.comparable === 0) return null;
      return row.agreeCount / row.comparable;
    });
    const total = (pick: (row: AdminDecisionsQualityWeek) => number) =>
      rows.reduce((acc, row) => acc + pick(row), 0);
    return {
      useCase,
      samples: total((row) => row.samples),
      comparable: total((row) => row.comparable),
      agreeCount: total((row) => row.agreeCount),
      replayFailed: total((row) => row.replayFailed),
      series,
      jevLatencyMs: weightedAverage(
        total((row) => row.jevLatencySum),
        total((row) => row.jevLatencyCount)
      ),
      llmLatencyMs: weightedAverage(
        total((row) => row.llmLatencySum),
        total((row) => row.llmLatencyCount)
      ),
      llmCost: weightedAverage(
        total((row) => row.llmCostSum),
        total((row) => row.llmCostCount)
      ),
    };
  });
}
