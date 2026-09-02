import { effortToPoints, statusCompletionCredit } from "./cycle";
import { isClosedStatus } from "./issue-constants";
import type { IssueEffort, IssueStatus } from "./issue-constants";

const DAY_MS = 86_400_000;
const RECENT_DAYS = 7;
const FORECAST_DAYS = 28;
export const OBJECTIVE_MOMENTUM_WEEKS = 8;

export type ObjectiveMomentumState =
  | "accelerating"
  | "steady"
  | "slowing"
  | "stalled"
  | "not_started"
  | "complete";

export type ObjectiveTargetPace = "on_track" | "at_risk" | "overdue";

export interface ObjectiveMomentumWeek {
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
  weeks: ObjectiveMomentumWeek[];
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

function endOfTargetDay(value: string): number | null {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestamp = new Date(dateOnly ? `${value}T23:59:59.999` : value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
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
 * The forecast uses effort-weighted throughput over at most 28 days and only
 * appears after two completions and a full observed week. This keeps a single
 * quick win from turning into a precise-looking but meaningless finish date.
 */
export function objectiveMomentum(
  objective: ObjectiveMomentumSource,
  issues: ObjectiveMomentumIssue[],
  now: Date = new Date(),
): ObjectiveMomentumInsight {
  const nowMs = now.getTime();
  const createdAt = validTimestamp(objective.created_at) ?? nowMs;
  const linked = issues.filter((issue) => issue.objective_id === objective.id);
  const remaining = linked.filter(
    (issue) => !isClosedStatus(issue.status as IssueStatus),
  );

  const completions: Completion[] = linked.flatMap((issue) => {
    if (issue.status !== "done") return [];
    const at = validTimestamp(issue.completed_at);
    if (at === null || at < createdAt || at > nowMs) return [];
    return [{ at, points: effortToPoints(issue.effort) }];
  });

  const recentStart = nowMs - RECENT_DAYS * DAY_MS;
  const previousStart = nowMs - RECENT_DAYS * 2 * DAY_MS;
  const recentCompleted = completions.filter(({ at }) => at >= recentStart).length;
  const previousCompleted = completions.filter(
    ({ at }) => at >= previousStart && at < recentStart,
  ).length;

  const chartStart = nowMs - OBJECTIVE_MOMENTUM_WEEKS * RECENT_DAYS * DAY_MS;
  const weeks = Array.from({ length: OBJECTIVE_MOMENTUM_WEEKS }, (_, index) => {
    const start = chartStart + index * RECENT_DAYS * DAY_MS;
    const end = start + RECENT_DAYS * DAY_MS;
    return {
      start: new Date(start).toISOString(),
      end: new Date(Math.min(end, nowMs)).toISOString(),
      completed: completions.filter(
        ({ at }) => at >= start && (index === OBJECTIVE_MOMENTUM_WEEKS - 1 ? at <= end : at < end),
      ).length,
    };
  });

  const forecastStart = Math.max(createdAt, nowMs - FORECAST_DAYS * DAY_MS);
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

  let forecastDays: number | null = null;
  let forecastDate: string | null = null;
  if (
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
  const targetAt = objective.target_date
    ? endOfTargetDay(objective.target_date)
    : null;
  if (remaining.length > 0 && targetAt !== null) {
    if (targetAt < nowMs) targetPace = "overdue";
    else if (forecastDate) {
      targetPace = new Date(forecastDate).getTime() <= targetAt ? "on_track" : "at_risk";
    }
  }

  const lastCompletion = completions.reduce<number | null>(
    (latest, completion) =>
      latest === null || completion.at > latest ? completion.at : latest,
    null,
  );

  return {
    state: momentumState({
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
    weeks,
    forecastDate,
    forecastDays,
    targetPace,
  };
}
