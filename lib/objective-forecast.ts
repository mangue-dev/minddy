import { effortToPoints, statusCompletionCredit } from "./cycle";
import { isClosedStatus } from "./issue-constants";
import type { IssueEffort, IssueStatus } from "./issue-constants";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_HOURS = 168;
const WEEK_MS = WEEK_HOURS * HOUR_MS;

/** History used to learn when each contributor is usually active. */
export const FORECAST_PROFILE_DAYS = 84;
/** History used to measure each contributor's throughput and allocation. */
export const FORECAST_THROUGHPUT_DAYS = 42;
/** Estimates further away than this are not estimates any more. */
const HORIZON_HOURS = 2 * 365 * 24;
/** Completions a contributor needs in the throughput window to be measured. */
const MIN_COMPLETIONS = 2;
/** Weight, in completions, of the working-week prior in an activity profile. */
const PRIOR_WEIGHT = 12;
/** Relative activity of an hour outside the prior's working week. */
const OFF_HOURS_PRIOR = 0.05;
/** Relative activity under which an hour is not worked at all. */
const INACTIVE_BELOW = 0.2;
const EPSILON = 1e-9;

export interface ForecastIssue {
  objective_id: string | null;
  assignee_id: string | null;
  status: string;
  effort?: IssueEffort | null;
  completed_at?: string | null;
}

export interface ObjectiveForecastResult {
  /** Instant at which every remaining point is expected to be delivered. */
  finishAt: number | null;
  /** Contributors whose measured throughput feeds the estimate. */
  contributors: number;
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
}

/** Hour of an absolute week grid. Any fixed grid works: profiles and walks share it. */
function hourOfWeek(at: number): number {
  return ((Math.floor(at / HOUR_MS) % WEEK_HOURS) + WEEK_HOURS) % WEEK_HOURS;
}

/** Points still to deliver, with the partial credit of work in flight. */
function remainingPoints(issue: ForecastIssue): number {
  return effortToPoints(issue.effort) *
    (1 - statusCompletionCredit(issue.status as IssueStatus));
}

/** Open work that counts as allocated: triage has not been accepted yet. */
function isCommittedOpen(issue: ForecastIssue): boolean {
  return issue.status !== "triage" && !isClosedStatus(issue.status as IssueStatus);
}

/**
 * Monday to Friday, 9:00 to 18:00 in `timeZone`, as relative weights on the
 * absolute week grid. It only shapes profiles with little history of their own.
 */
export function workWeekPrior(timeZone: string, now: Date): number[] {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC", weekday: "short", hour: "2-digit", hourCycle: "h23",
    });
  }
  // The current week anchors the grid, so the zone's present offset applies.
  const weekStart = Math.floor(now.getTime() / WEEK_MS) * WEEK_MS;
  return Array.from({ length: WEEK_HOURS }, (_, index) => {
    const parts = formatter.formatToParts(weekStart + index * HOUR_MS);
    const weekday = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const working = weekday !== "Sat" && weekday !== "Sun" && hour >= 9 && hour < 18;
    return working ? 1 : OFF_HOURS_PRIOR;
  });
}

/**
 * Relative activity of each hour of the week, averaging 1. Completion times
 * are smoothed over neighboring hours, then blended with the prior: a sparse
 * history leans on the working week, a dense one speaks for itself. Hours
 * below a fifth of the average are inactive and weigh nothing; otherwise a
 * sub-percent remainder would trickle over a weekend and finish on a Saturday.
 */
export function activityProfile(completions: number[], prior: number[]): number[] {
  const histogram = new Array<number>(WEEK_HOURS).fill(0);
  for (const at of completions) {
    const hour = hourOfWeek(at);
    histogram[hour] += 0.5;
    histogram[(hour + 1) % WEEK_HOURS] += 0.25;
    histogram[(hour + WEEK_HOURS - 1) % WEEK_HOURS] += 0.25;
  }
  const priorTotal = prior.reduce((sum, weight) => sum + weight, 0);
  const total = completions.length + PRIOR_WEIGHT;
  const blended = histogram.map((count, hour) =>
    WEEK_HOURS * (count + PRIOR_WEIGHT * prior[hour] / priorTotal) / total);
  const active = blended.map((weight) => weight >= INACTIVE_BELOW ? weight : 0);
  const activeTotal = active.reduce((sum, weight) => sum + weight, 0);
  return active.map((weight) => WEEK_HOURS * weight / activeTotal);
}

/** Active hours between two instants: wall-clock hours weighted by the profile. */
export function activeHours(profile: number[], from: number, to: number): number {
  let total = 0;
  let cursor = from;
  while (cursor < to) {
    const hourEnd = (Math.floor(cursor / HOUR_MS) + 1) * HOUR_MS;
    const end = Math.min(hourEnd, to);
    total += profile[hourOfWeek(cursor)] * (end - cursor) / HOUR_MS;
    cursor = end;
  }
  return total;
}

interface Contributor {
  /** Objective points delivered per active hour. */
  rate: number;
  profile: number[];
  own: number;
}

/**
 * Estimate when an objective's remaining work will be done from the people
 * doing it, rather than from the objective alone.
 *
 * `issues` holds every issue linked to the objective and, for each person
 * assigned to linked work, their issues across every project: open ones and
 * those completed within the profile window. For each contributor:
 * - an activity profile learned from their completion times says when they
 *   work, so nights and weekends add no progress;
 * - throughput is their delivered points per active hour, all projects
 *   together, over the last six weeks;
 * - the share of that capacity going to this objective averages two signals:
 *   the share of their recent delivery that was objective work, and the share
 *   of their committed open work that belongs to the objective.
 *
 * A walk forward, hour by hour, lets each contributor drain their own part,
 * then help with unassigned work. Work assigned to someone without measured
 * throughput joins the unassigned pool. With no measured contributor the
 * result is null and callers fall back to the objective's own pace.
 */
export function objectiveForecast(
  objectiveId: string,
  issues: ForecastIssue[],
  now: Date,
  timeZone: string,
): ObjectiveForecastResult {
  const nowMs = now.getTime();
  const profileStart = nowMs - FORECAST_PROFILE_DAYS * DAY_MS;
  const throughputStart = nowMs - FORECAST_THROUGHPUT_DAYS * DAY_MS;
  const prior = workWeekPrior(timeZone, now);

  const linked = issues.filter((issue) => issue.objective_id === objectiveId);
  let pool = 0;
  const assignees = new Set<string>();
  for (const issue of linked) {
    if (issue.assignee_id) assignees.add(issue.assignee_id);
    else if (!isClosedStatus(issue.status as IssueStatus)) pool += remainingPoints(issue);
  }

  const contributors: Contributor[] = [];
  for (const assignee of assignees) {
    const own = issues.filter((issue) => issue.assignee_id === assignee);
    const completed = own.flatMap((issue) => {
      if (issue.status !== "done") return [];
      const at = timestamp(issue.completed_at);
      return at !== null && at >= profileStart && at <= nowMs
        ? [{ at, issue }] : [];
    });
    const objectiveOpen = own
      .filter((issue) => issue.objective_id === objectiveId &&
        !isClosedStatus(issue.status as IssueStatus))
      .reduce((sum, issue) => sum + remainingPoints(issue), 0);

    const recent = completed.filter(({ at }) => at >= throughputStart);
    const delivered = recent.reduce((sum, { issue }) => sum + effortToPoints(issue.effort), 0);
    if (recent.length < MIN_COMPLETIONS || delivered <= 0) {
      pool += objectiveOpen;
      continue;
    }

    const profile = activityProfile(completed.map(({ at }) => at), prior);
    const throughput = delivered / activeHours(profile, throughputStart, nowMs);
    const objectiveDelivered = recent
      .filter(({ issue }) => issue.objective_id === objectiveId)
      .reduce((sum, { issue }) => sum + effortToPoints(issue.effort), 0);
    const deliveryShare = objectiveDelivered / delivered;
    const openTotal = own
      .filter(isCommittedOpen)
      .reduce((sum, issue) => sum + remainingPoints(issue), 0);
    const backlogShare = openTotal > 0
      ? own
          .filter((issue) => issue.objective_id === objectiveId && isCommittedOpen(issue))
          .reduce((sum, issue) => sum + remainingPoints(issue), 0) / openTotal
      : deliveryShare;
    const rate = throughput * (deliveryShare + backlogShare) / 2;
    if (rate <= 0) {
      pool += objectiveOpen;
      continue;
    }
    contributors.push({ rate, profile, own: objectiveOpen });
  }

  if (contributors.length === 0) return { finishAt: null, contributors: 0 };
  const total = pool + contributors.reduce((sum, contributor) => sum + contributor.own, 0);
  if (total <= EPSILON) return { finishAt: null, contributors: contributors.length };

  // Rounding over thousands of hourly steps leaves residues: ignore them.
  const tolerance = total * 1e-6;
  let cursor = nowMs;
  for (let step = 0; step < HORIZON_HOURS; step += 1) {
    const hourEnd = (Math.floor(cursor / HOUR_MS) + 1) * HOUR_MS;
    const fraction = (hourEnd - cursor) / HOUR_MS;
    const hour = hourOfWeek(cursor);
    for (const contributor of contributors) {
      let capacity = contributor.rate * contributor.profile[hour] * fraction;
      const spent = Math.min(capacity, contributor.own);
      contributor.own -= spent;
      capacity -= spent;
      pool -= Math.min(capacity, pool);
    }
    cursor = hourEnd;
    if (pool <= tolerance && contributors.every((contributor) => contributor.own <= tolerance)) {
      return { finishAt: cursor, contributors: contributors.length };
    }
  }
  return { finishAt: null, contributors: contributors.length };
}
