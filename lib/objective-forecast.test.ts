import { describe, expect, it } from "vitest";
import {
  activeHours,
  activityProfile,
  objectiveForecast,
  workWeekPrior,
  type ForecastIssue,
} from "./objective-forecast";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Friday 17:00 UTC.
const NOW = new Date("2026-10-30T17:00:00.000Z");
const OBJECTIVE = "objective-1";

/** One completion per weekday at `hour` UTC over the six weeks before NOW. */
function weekdayCompletions(hour: number): string[] {
  const result: string[] = [];
  for (let day = 1; day <= 42; day += 1) {
    const date = new Date(NOW.getTime() - day * DAY);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    date.setUTCHours(hour, 0, 0, 0);
    result.push(date.toISOString());
  }
  return result;
}

function done(assignee: string | null, completedAt: string, objective: string | null = OBJECTIVE): ForecastIssue {
  return { objective_id: objective, assignee_id: assignee, status: "done", effort: "m", completed_at: completedAt };
}

function open(assignee: string | null, objective: string | null = OBJECTIVE, status = "todo"): ForecastIssue {
  return { objective_id: objective, assignee_id: assignee, status, effort: "m", completed_at: null };
}

function durationDays(issues: ForecastIssue[]): number {
  const { finishAt } = objectiveForecast(OBJECTIVE, issues, NOW, "UTC");
  expect(finishAt).not.toBeNull();
  return (finishAt! - NOW.getTime()) / DAY;
}

describe("activity profile", () => {
  it("averages one active hour per wall-clock hour over a full week", () => {
    const profile = activityProfile([], workWeekPrior("UTC", NOW));
    expect(profile).toHaveLength(168);
    expect(activeHours(profile, NOW.getTime(), NOW.getTime() + 7 * DAY)).toBeCloseTo(168, 6);
  });

  it("concentrates activity on the hours a person actually completes work", () => {
    const completions = weekdayCompletions(6).map((at) => new Date(at).getTime());
    const profile = activityProfile(completions, workWeekPrior("UTC", NOW));
    const monday = new Date("2026-10-26T00:00:00.000Z").getTime();
    const early = activeHours(profile, monday + 5 * HOUR, monday + 8 * HOUR);
    const night = activeHours(profile, monday + 22 * HOUR, monday + 25 * HOUR);
    const afternoon = activeHours(profile, monday + 14 * HOUR, monday + 17 * HOUR);
    expect(early).toBeGreaterThan(afternoon);
    expect(afternoon).toBeGreaterThan(night);
  });

  it("places the prior's working week in the requested zone", () => {
    const paris = workWeekPrior("Europe/Paris", NOW);
    const newYork = workWeekPrior("America/New_York", NOW);
    expect(paris).not.toEqual(newYork);
    expect(workWeekPrior("Not/AZone", NOW)).toEqual(workWeekPrior("UTC", NOW));
  });
});

describe("objectiveForecast", () => {
  it("does not progress over nights and weekends", () => {
    const history = weekdayCompletions(10).map((at) => done("alice", at));
    const remaining = { ...open("alice"), effort: "s" as const };
    const { finishAt } = objectiveForecast(OBJECTIVE, [...history, remaining], NOW, "UTC");
    expect(finishAt).not.toBeNull();
    const finish = new Date(finishAt!);
    // Less than a day of work remains on a Friday evening: it lands on Monday.
    expect(finish.getUTCDay()).toBe(1);
    expect(finish.getUTCHours()).toBeGreaterThanOrEqual(8);
    expect(finish.getUTCHours()).toBeLessThanOrEqual(18);
  });

  it("never finishes on a weekend from a residue of the previous week", () => {
    // Sparse history: eight completions, one every four days, mostly the prior.
    const saturday = new Date("2026-10-31T13:05:00.000Z");
    const history = [29, 23, 21, 16, 13, 9, 5, 1].map((day) =>
      done("alice", `2026-10-${String(day).padStart(2, "0")}T09:30:00.000Z`));
    const remaining = Array.from({ length: 4 }, () => open("alice"));
    const { finishAt } = objectiveForecast(OBJECTIVE, [...history, ...remaining], saturday, "Europe/Paris");
    expect(finishAt).not.toBeNull();
    expect([0, 6]).not.toContain(new Date(finishAt!).getUTCDay());
  });

  it("only counts the share of a contributor's capacity spent on the objective", () => {
    const focused = weekdayCompletions(10).map((at) => done("alice", at));
    const split = weekdayCompletions(10).map((at, index) =>
      done("alice", at, index % 2 === 0 ? OBJECTIVE : "elsewhere"));
    const remaining = Array.from({ length: 10 }, () => open("alice"));
    const focusedDays = durationDays([...focused, ...remaining]);
    const splitDays = durationDays([...split, ...remaining]);
    expect(splitDays).toBeGreaterThan(focusedDays * 1.1);
  });

  it("slows down when the contributor's open work mostly belongs elsewhere", () => {
    const history = weekdayCompletions(10).map((at) => done("alice", at));
    const remaining = Array.from({ length: 5 }, () => open("alice"));
    const elsewhere = Array.from({ length: 20 }, () => open("alice", "other-objective"));
    const triage = Array.from({ length: 20 }, () => open("alice", "other-objective", "triage"));
    const alone = durationDays([...history, ...remaining]);
    expect(durationDays([...history, ...remaining, ...elsewhere])).toBeGreaterThan(alone * 1.25);
    // Untriaged requests are not allocated work yet.
    expect(durationDays([...history, ...remaining, ...triage])).toBeCloseTo(alone, 1);
  });

  it("finishes sooner with two contributors sharing the work in parallel", () => {
    const alice = weekdayCompletions(10).map((at) => done("alice", at));
    const bob = weekdayCompletions(10).map((at) => done("bob", at));
    const solo = durationDays([...alice, ...Array.from({ length: 10 }, () => open("alice"))]);
    const pair = durationDays([
      ...alice, ...bob,
      ...Array.from({ length: 5 }, () => open("alice")),
      ...Array.from({ length: 5 }, () => open("bob")),
    ]);
    expect(pair).toBeLessThan(solo * 0.7);
  });

  it("hands unassigned work and unmeasured assignees to measured contributors", () => {
    const alice = weekdayCompletions(10).map((at) => done("alice", at));
    const result = objectiveForecast(OBJECTIVE, [
      ...alice,
      open("alice"),
      open(null),
      open("newcomer"),
    ], NOW, "UTC");
    expect(result.contributors).toBe(1);
    expect(result.finishAt).not.toBeNull();
    expect(durationDays([...alice, open("alice"), open(null), open("newcomer")]))
      .toBeGreaterThan(durationDays([...alice, open("alice")]));
  });

  it("returns no estimate without a measured contributor", () => {
    expect(objectiveForecast(OBJECTIVE, [
      done(null, "2026-10-29T10:00:00.000Z"),
      done("alice", "2026-10-29T10:00:00.000Z"),
      open("alice"),
      open(null),
    ], NOW, "UTC")).toEqual({ finishAt: null, contributors: 0 });
  });

  it("ignores completions outside the history windows and in the future", () => {
    const stale = Array.from({ length: 5 }, (_, index) =>
      done("alice", new Date(NOW.getTime() - (100 + index) * DAY).toISOString()));
    const future = [done("alice", "2026-11-05T10:00:00.000Z"), done("alice", "2026-11-06T10:00:00.000Z")];
    expect(objectiveForecast(OBJECTIVE, [...stale, ...future, open("alice")], NOW, "UTC").finishAt)
      .toBeNull();
  });
});
