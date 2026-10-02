import { USAGE_SEGMENTS } from "@/lib/billing-plans";
import type { UsageDay } from "@/lib/billing-types";

export interface DailyUsageRow {
  day: string;
  feature: string;
  cost: number | string;
}

const DAY_MS = 86_400_000;
const roundUsd = (value: number) => Math.round(value * 1e6) / 1e6;

/** Fill elapsed UTC days only. Future days are not observations or forecasts. */
export function buildUsageDays(
  rows: DailyUsageRow[],
  periodStart: string,
  periodEnd: string,
  observedAt: string,
): UsageDay[] {
  const start = Date.parse(periodStart);
  const until = Math.min(Date.parse(periodEnd), Date.parse(observedAt));
  if (!Number.isFinite(start) || !Number.isFinite(until) || until <= start)
    return [];
  const days: UsageDay[] = [];
  const byDay = new Map<string, UsageDay>();
  for (let at = Math.floor(start / DAY_MS) * DAY_MS; at < until; at += DAY_MS) {
    const day: UsageDay = {
      day: new Date(at).toISOString().slice(0, 10),
      usd: 0,
      segments: USAGE_SEGMENTS.map(({ id }) => ({ id, usd: 0 })),
    };
    days.push(day);
    byDay.set(day.day, day);
  }
  for (const row of rows) {
    const day = byDay.get(row.day);
    const cost = Number(row.cost);
    if (!day || !Number.isFinite(cost) || cost <= 0) continue;
    const id =
      USAGE_SEGMENTS.find((segment) =>
        (segment.features as readonly string[]).includes(row.feature),
      )?.id ?? "numo";
    day.usd += cost;
    day.segments.find((segment) => segment.id === id)!.usd += cost;
  }
  return days.map((day) => ({
    ...day,
    usd: roundUsd(day.usd),
    segments: day.segments.map((segment) => ({
      ...segment,
      usd: roundUsd(segment.usd),
    })),
  }));
}
