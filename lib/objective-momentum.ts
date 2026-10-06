import { effortToPoints, statusCompletionCredit } from "./cycle";
import { isClosedStatus } from "./issue-constants";
import type { IssueEffort, IssueStatus } from "./issue-constants";
import type { ObjectiveStatus } from "./objective-validation";

const DAY_MS = 86_400_000;
const RECENT_DAYS = 7;
const FORECAST_DAYS = 28;
export const OBJECTIVE_MOMENTUM_INTERVALS = 8;

export type ObjectiveMomentumState =
  | "accelerating"
  | "steady"
  | "slowing"
  | "stalled"
  | "not_started"
  | "complete"
  | "canceled";

export type ObjectiveTargetPace = "on_track" | "at_risk" | "overdue";

export interface ObjectiveMomentumInterval {
  start: string;
  end: string;
  completed: number;
}

export interface ObjectiveMomentumInsight {
  state: ObjectiveMomentumState;
  linkedIssues: number;
  remainingIssues: number;
  recentCompleted: number;
  previousCompleted: number;
  lastCompletionAt: string | null;
  intervals: ObjectiveMomentumInterval[];
  period: { start: string; end: string } | null;
  periodCompleted: number;
  progressPercent: number | null;
  elapsedPercent: number | null;
  forecastDate: string | null;
  forecastDays: number | null;
  targetPace: ObjectiveTargetPace | null;
}

export interface ObjectiveMomentumIssue {
  objective_id: string | null;
  status: string;
  effort?: IssueEffort | null;
  completed_at?: string | null;
}

interface ObjectiveMomentumSource {
  id: string;
  status: ObjectiveStatus;
  created_at: string;
  target_date: string | null;
}

interface Completion {
  at: number;
  points: number;
}

function validTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function endOfTargetDay(value: string, timeZone: string): number | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const targetAt = validTimestamp(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (targetAt === null) return null;

  // Use the formatter's explicit zone, never the renderer's implicit zone.
  // SSR and initial hydration inherit the same next-intl configuration; later
  // browser-zone changes update both deadline arithmetic and labels together.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const partsAt = (timestamp: number) => {
    const parts = formatter.formatToParts(timestamp);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    return {
      year: part("year"), month: part("month"), day: part("day"),
      hour: part("hour"), minute: part("minute"), second: part("second"),
    };
  };
  const parts = partsAt(targetAt);
  if (!dateOnly && (parts.hour !== 0 || parts.minute !== 0 || parts.second !== 0 || targetAt % 1000 !== 0)) {
    return targetAt;
  }

  // Bare dates carry their own calendar day. ISO midnight selections carry
  // an instant, so recover the day in the same zone used to display it.
  const date = new Date(targetAt);
  const endOfDay = dateOnly
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
    : Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999);
  let result = endOfDay;
  // Resolve the offset at the end of the day, rather than adding 24 hours to
  // midnight: daylight-saving days can contain 23 or 25 hours.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const p = partsAt(result);
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
      - (result - new Date(result).getUTCMilliseconds());
    const next = endOfDay - offset;
    if (next === result) break;
    result = next;
  }
  return result;
}

function momentumState({
  linkedIssues,
  remainingIssues,
  completedTotal,
  recentCompleted,
  previousCompleted,
}: {
  linkedIssues: number;
  remainingIssues: number;
  completedTotal: number;
  recentCompleted: number;
  previousCompleted: number;
}): ObjectiveMomentumState {
  if (linkedIssues > 0 && remainingIssues === 0) return "complete";
  if (completedTotal === 0) return "not_started";
  if (recentCompleted === 0) return "stalled";
  if (recentCompleted > previousCompleted) return "accelerating";
  if (recentCompleted < previousCompleted) return "slowing";
  return "steady";
}

/**
 * Derive a compact, deliberately conservative objective health signal from the
 * issue data already loaded by the Objectives page. Only issues currently
 * linked to the objective are considered. A completion that predates the
 * objective is excluded: attaching old work should raise overall progress, but
 * must not manufacture recent momentum.
 *
 * With a target, history spans creation to the deadline and throughput uses
 * the time observed since creation, including work after an overdue deadline.
 * Future time never dilutes throughput. Without a target, retain the rolling
 * eight-week history and 28-day forecast. Estimates require two completions
 * and a full observed week to avoid extrapolating from a single quick win.
 */
export function objectiveMomentum(
  objective: ObjectiveMomentumSource,
  issues: ObjectiveMomentumIssue[],
  now: Date = new Date(),
  timeZone: string = "UTC",
): ObjectiveMomentumInsight {
  const nowMs = now.getTime();
  const createdAt = validTimestamp(objective.created_at) ?? nowMs;
  const targetAt = objective.target_date
    ? endOfTargetDay(objective.target_date, timeZone)
    : null;
  const period =
    targetAt !== null && targetAt > createdAt
      ? {
          start: new Date(createdAt).toISOString(),
          end: new Date(targetAt).toISOString(),
        }
      : null;
  const linked = issues.filter((issue) => issue.objective_id === objective.id);
  const remaining = linked.filter(
    (issue) => !isClosedStatus(issue.status as IssueStatus),
  );
  const canceled = objective.status === "canceled";

  const completions: Completion[] = (canceled ? [] : linked).flatMap((issue) => {
    if (issue.status !== "done") return [];
    const at = validTimestamp(issue.completed_at);
    if (at === null || at < createdAt || at > nowMs) return [];
    return [{ at, points: effortToPoints(issue.effort) }];
  });

  // Compare equal observed halves for a target period, rather than an unrelated
  // rolling week. The rolling comparison remains useful without a deadline.
  const comparisonMs = period
    ? Math.max(0, nowMs - createdAt) / 2
    : RECENT_DAYS * DAY_MS;
  const recentStart = nowMs - comparisonMs;
  const previousStart = nowMs - comparisonMs * 2;
  const recentCompleted = completions.filter(({ at }) => at >= recentStart).length;
  const previousCompleted = completions.filter(
    ({ at }) => at >= previousStart && at < recentStart,
  ).length;

  const chartStart = period
    ? createdAt
    : nowMs - OBJECTIVE_MOMENTUM_INTERVALS * RECENT_DAYS * DAY_MS;
  const chartEnd = period ? targetAt ?? nowMs : nowMs;
  const intervalMs = (chartEnd - chartStart) / OBJECTIVE_MOMENTUM_INTERVALS;
  const intervals = Array.from({ length: OBJECTIVE_MOMENTUM_INTERVALS }, (_, index) => {
    const start = Math.floor(chartStart + index * intervalMs);
    const end =
      index === OBJECTIVE_MOMENTUM_INTERVALS - 1
        ? chartEnd
        : Math.floor(chartStart + (index + 1) * intervalMs);
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      completed: completions.filter(
        ({ at }) =>
          at >= start &&
          (index === OBJECTIVE_MOMENTUM_INTERVALS - 1 ? at <= end : at < end),
      ).length,
    };
  });

  const forecastStart = period
    ? createdAt
    : Math.max(createdAt, nowMs - FORECAST_DAYS * DAY_MS);
  const observedDays = (nowMs - forecastStart) / DAY_MS;
  const forecastCompletions = completions.filter(({ at }) => at >= forecastStart);
  const deliveredPoints = forecastCompletions.reduce(
    (sum, completion) => sum + completion.points,
    0,
  );
  const remainingPoints = remaining.reduce((sum, issue) => {
    const points = effortToPoints(issue.effort);
    return sum + points * (1 - statusCompletionCredit(issue.status as IssueStatus));
  }, 0);
  const totalPoints = linked.reduce((sum, issue) => sum + effortToPoints(issue.effort), 0);
  const progressPercent =
    !canceled && totalPoints > 0
      ? 100 * (1 - remainingPoints / totalPoints)
      : null;
  const elapsedPercent = period
    ? Math.max(0, Math.min(100, 100 * (nowMs - createdAt) / (chartEnd - createdAt)))
    : null;

  let forecastDays: number | null = null;
  let forecastDate: string | null = null;
  if (
    !canceled &&
    remainingPoints > 0 &&
    observedDays >= RECENT_DAYS &&
    forecastCompletions.length >= 2 &&
    deliveredPoints > 0
  ) {
    const pointsPerDay = deliveredPoints / observedDays;
    forecastDays = Math.max(1, Math.ceil(remainingPoints / pointsPerDay));
    forecastDate = new Date(nowMs + forecastDays * DAY_MS).toISOString();
  }

  let targetPace: ObjectiveTargetPace | null = null;
  if (!canceled && remaining.length > 0 && targetAt !== null) {
    if (targetAt < nowMs) targetPace = "overdue";
    else if (forecastDate) {
      targetPace = new Date(forecastDate).getTime() <= targetAt ? "on_track" : "at_risk";
    } else if (progressPercent !== null && elapsedPercent !== null) {
      targetPace = progressPercent >= elapsedPercent ? "on_track" : "at_risk";
    }
  }

  const lastCompletion = completions.reduce<number | null>(
    (latest, completion) =>
      latest === null || completion.at > latest ? completion.at : latest,
    null,
  );

  return {
    state: canceled
      ? "canceled"
      : momentumState({
          linkedIssues: linked.length,
          remainingIssues: remaining.length,
          completedTotal: completions.length,
          recentCompleted,
          previousCompleted,
        }),
    linkedIssues: linked.length,
    remainingIssues: remaining.length,
    recentCompleted,
    previousCompleted,
    lastCompletionAt:
      lastCompletion === null ? null : new Date(lastCompletion).toISOString(),
    intervals,
    period,
    periodCompleted: completions.filter(({ at }) => at >= chartStart && at <= chartEnd).length,
    progressPercent,
    elapsedPercent,
    forecastDate,
    forecastDays,
    targetPace,
  };
}
