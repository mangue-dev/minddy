import { describe, expect, it } from "vitest";
import { objectiveMomentum } from "./objective-momentum";

const NOW = new Date("2026-09-02T12:00:00.000Z");
const OBJECTIVE = {
  id: "objective-1",
  status: "in_progress" as const,
  created_at: "2026-07-01T12:00:00.000Z",
  target_date: null,
};

function issue({
  id,
  status = "done",
  completedAt,
  effort = "m",
}: {
  id: number;
  status?: string;
  completedAt?: string | null;
  effort?: "xs" | "s" | "m" | "l" | "xl";
}) {
  return {
    id: `issue-${id}`,
    objective_id: OBJECTIVE.id,
    status,
    effort,
    completed_at: completedAt ?? null,
  };
}

describe("objectiveMomentum", () => {
  it("returns a quiet empty signal when there is no linked work", () => {
    const result = objectiveMomentum(OBJECTIVE, [], NOW);

    expect(result).toMatchObject({
      state: "not_started",
      linkedIssues: 0,
      remainingIssues: 0,
      recentCompleted: 0,
      previousCompleted: 0,
      forecastDate: null,
      targetPace: null,
    });
    expect(result.intervals).toHaveLength(8);
  });

  it("compares the last seven days with the seven before", () => {
    const result = objectiveMomentum(
      OBJECTIVE,
      [
        issue({ id: 1, completedAt: "2026-09-01T08:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-08-29T08:00:00.000Z" }),
        issue({ id: 3, completedAt: "2026-08-22T08:00:00.000Z" }),
        issue({ id: 4, status: "todo" }),
      ],
      NOW,
    );

    expect(result).toMatchObject({
      state: "accelerating",
      recentCompleted: 2,
      previousCompleted: 1,
      remainingIssues: 1,
    });
    expect(result.intervals.at(-1)?.completed).toBe(2);
    expect(result.intervals.at(-2)?.completed).toBe(1);
  });

  it("marks an unfinished objective as stalled after its recent pace drops to zero", () => {
    const result = objectiveMomentum(
      OBJECTIVE,
      [
        issue({ id: 1, completedAt: "2026-08-10T08:00:00.000Z" }),
        issue({ id: 2, status: "in_progress" }),
      ],
      NOW,
    );

    expect(result.state).toBe("stalled");
    expect(result.lastCompletionAt).toBe("2026-08-10T08:00:00.000Z");
  });

  it("does not turn work completed before the objective existed into momentum", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, created_at: "2026-09-01T12:00:00.000Z" },
      [
        issue({ id: 1, completedAt: "2026-08-31T08:00:00.000Z" }),
        issue({ id: 2, status: "todo" }),
      ],
      NOW,
    );

    expect(result.state).toBe("not_started");
    expect(result.recentCompleted).toBe(0);
  });

  it("forecasts from the full observed target period and flags the target pace", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, target_date: "2026-09-10" },
      [
        issue({ id: 1, completedAt: "2026-08-12T08:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-08-22T08:00:00.000Z" }),
        issue({ id: 3, status: "todo" }),
      ],
      NOW,
    );

    expect(result.forecastDays).toBe(32);
    expect(result.forecastDate).toBe("2026-10-04T12:00:00.000Z");
    expect(result.targetPace).toBe("at_risk");
  });

  it("keeps a local-midnight ISO target valid through the full target day", () => {
    const now = new Date(2026, 8, 2, 12, 0, 0, 0);
    const target = new Date(2026, 8, 2, 0, 0, 0, 0).toISOString();
    const result = objectiveMomentum(
      { ...OBJECTIVE, target_date: target },
      [issue({ id: 1, status: "todo" })],
      now,
    );

    expect(result.targetPace).toBe("at_risk");
  });

  it("preserves an explicitly selected target time", () => {
    const now = new Date(2026, 8, 2, 12, 0, 0, 0);
    const target = new Date(2026, 8, 2, 10, 0, 0, 0).toISOString();
    const result = objectiveMomentum(
      { ...OBJECTIVE, target_date: target },
      [issue({ id: 1, status: "todo" })],
      now,
    );

    expect(result.targetPace).toBe("overdue");
  });

  it("keeps a same-day forecast on track for an ISO target", () => {
    const now = new Date(2026, 8, 2, 12, 0, 0, 0);
    const result = objectiveMomentum(
      {
        ...OBJECTIVE,
        created_at: new Date(2026, 7, 26, 12, 0, 0, 0).toISOString(),
        target_date: new Date(2026, 8, 3, 0, 0, 0, 0).toISOString(),
      },
      [
        issue({
          id: 1,
          completedAt: new Date(2026, 7, 30, 8, 0, 0, 0).toISOString(),
          effort: "xl",
        }),
        issue({
          id: 2,
          completedAt: new Date(2026, 8, 1, 8, 0, 0, 0).toISOString(),
          effort: "xl",
        }),
        issue({ id: 3, status: "todo", effort: "xs" }),
      ],
      now,
    );

    expect(result.forecastDays).toBe(1);
    expect(result.targetPace).toBe("on_track");
  });

  it("does not forecast from a single completion", () => {
    const result = objectiveMomentum(
      OBJECTIVE,
      [
        issue({ id: 1, completedAt: "2026-08-29T08:00:00.000Z" }),
        issue({ id: 2, status: "todo" }),
      ],
      NOW,
    );

    expect(result.forecastDate).toBeNull();
    expect(result.forecastDays).toBeNull();
  });

  it("retains the rolling 28-day forecast without a target date", () => {
    const result = objectiveMomentum(OBJECTIVE, [
      issue({ id: 1, completedAt: "2026-08-12T08:00:00.000Z" }),
      issue({ id: 2, completedAt: "2026-08-22T08:00:00.000Z" }),
      issue({ id: 3, status: "todo" }),
    ], NOW);

    expect(result.period).toBeNull();
    expect(result.forecastDays).toBe(14);
    expect(result.forecastDate).toBe("2026-09-16T12:00:00.000Z");
    expect(result.targetPace).toBeNull();
  });

  it("spans creation to the target and leaves future intervals empty", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, created_at: "2026-08-05T12:00:00.000Z", target_date: "2026-09-30T12:00:00.000Z" },
      [
        issue({ id: 1, completedAt: "2026-08-05T12:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-08-12T12:00:00.000Z" }),
        issue({ id: 3, completedAt: NOW.toISOString() }),
        issue({ id: 4, completedAt: "2026-09-10T12:00:00.000Z" }),
        issue({ id: 5, status: "todo" }),
      ],
      NOW,
    );

    expect(result.period).toEqual({ start: "2026-08-05T12:00:00.000Z", end: "2026-09-30T12:00:00.000Z" });
    expect(result.intervals[0].start).toBe(result.period?.start);
    expect(result.intervals.at(-1)?.end).toBe(result.period?.end);
    expect(result.intervals.map((interval) => interval.completed)).toEqual([1, 1, 0, 0, 1, 0, 0, 0]);
    expect(result.periodCompleted).toBe(3);
    expect(result.elapsedPercent).toBe(50);
  });

  it("does not count future target days as observed throughput", () => {
    const issues = [
      issue({ id: 1, completedAt: "2026-08-06T12:00:00.000Z" }),
      issue({ id: 2, completedAt: "2026-08-13T12:00:00.000Z" }),
      issue({ id: 3, status: "todo" }),
    ];
    const source = { ...OBJECTIVE, created_at: "2026-08-05T12:00:00.000Z" };
    const near = objectiveMomentum({ ...source, target_date: "2026-09-10T12:00:00.000Z" }, issues, NOW);
    const far = objectiveMomentum({ ...source, target_date: "2027-09-10T12:00:00.000Z" }, issues, NOW);

    expect(near.forecastDays).toBe(14);
    expect(far.forecastDate).toBe(near.forecastDate);
    expect(near.targetPace).toBe("at_risk");
    expect(far.targetPace).toBe("on_track");
  });

  it("compares equal observed halves within the objective lifetime", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, created_at: "2026-08-05T12:00:00.000Z", target_date: "2026-09-30T12:00:00.000Z" },
      [
        issue({ id: 1, completedAt: "2026-08-10T12:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-08-20T12:00:00.000Z" }),
        issue({ id: 3, completedAt: "2026-08-22T12:00:00.000Z" }),
        issue({ id: 4, status: "todo" }),
      ],
      NOW,
    );

    expect(result).toMatchObject({ recentCompleted: 2, previousCompleted: 1, state: "accelerating" });
  });

  it("uses weighted progress against elapsed time before a forecast is available", () => {
    const source = { ...OBJECTIVE, created_at: "2026-08-05T12:00:00.000Z", target_date: "2026-09-30T12:00:00.000Z" };
    const ahead = objectiveMomentum(source, [
      issue({ id: 1, completedAt: "2026-08-10T12:00:00.000Z", effort: "xl" }),
      issue({ id: 2, status: "todo", effort: "xs" }),
    ], NOW);
    const behind = objectiveMomentum(source, [
      issue({ id: 1, completedAt: "2026-08-10T12:00:00.000Z", effort: "xs" }),
      issue({ id: 2, status: "todo", effort: "xl" }),
    ], NOW);

    expect(ahead.forecastDate).toBeNull();
    expect(ahead.progressPercent).toBeCloseTo(100 * 8 / 9);
    expect(ahead.targetPace).toBe("on_track");
    expect(behind.forecastDate).toBeNull();
    expect(behind.progressPercent).toBeCloseTo(100 / 9);
    expect(behind.targetPace).toBe("at_risk");
  });

  it("gives in-flight and closed work the same credit as objective progress", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, created_at: "2026-08-05T12:00:00.000Z", target_date: "2026-09-30T12:00:00.000Z" },
      [issue({ id: 1, status: "in_review" }), issue({ id: 2, status: "canceled" })],
      NOW,
    );

    expect(result.progressPercent).toBe(75);
    expect(result.targetPace).toBe("on_track");
    expect(result.periodCompleted).toBe(0);
    expect(result.forecastDate).toBeNull();
  });

  it("keeps forecasting overdue work while charting only the target period", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, created_at: "2026-08-05T12:00:00.000Z", target_date: "2026-08-19T12:00:00.000Z" },
      [
        issue({ id: 1, completedAt: "2026-08-19T12:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-08-20T12:00:00.000Z" }),
        issue({ id: 3, status: "todo" }),
      ],
      NOW,
    );

    expect(result.periodCompleted).toBe(1);
    expect(result.intervals.at(-1)?.completed).toBe(1);
    expect(result.forecastDays).toBe(14);
    expect(result.forecastDate).toBe("2026-09-16T12:00:00.000Z");
    expect(result.targetPace).toBe("overdue");
    expect(result.elapsedPercent).toBe(100);
  });

  it("does not fabricate a schedule signal for an empty objective", () => {
    const result = objectiveMomentum({ ...OBJECTIVE, target_date: "2026-09-30" }, [], NOW);

    expect(result.progressPercent).toBeNull();
    expect(result.targetPace).toBeNull();
    expect(result.forecastDate).toBeNull();
    expect(result.period).not.toBeNull();
  });

  it("does not forecast during an objective's first observed week", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, created_at: "2026-09-01T12:00:00.000Z", target_date: "2026-09-30" },
      [
        issue({ id: 1, completedAt: "2026-09-01T15:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-09-02T08:00:00.000Z" }),
        issue({ id: 3, status: "todo" }),
      ],
      NOW,
    );

    expect(result.forecastDate).toBeNull();
    expect(result.targetPace).toBe("on_track");
  });

  it("falls back to rolling history for invalid or non-positive target periods", () => {
    const issues = [issue({ id: 1, status: "todo" })];
    const fallback = objectiveMomentum(OBJECTIVE, issues, NOW);
    for (const target_date of ["invalid", OBJECTIVE.created_at, "2026-06-01T12:00:00.000Z"]) {
      const result = objectiveMomentum({ ...OBJECTIVE, target_date }, issues, NOW);
      expect(result.period).toBeNull();
      expect(result.intervals).toEqual(fallback.intervals);
      expect(result.elapsedPercent).toBeNull();
      expect(result.targetPace).toBe(target_date === "invalid" ? null : "overdue");
    }
  });

  it("ignores unrelated, invalid, and pre-objective completions in a target period", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, target_date: "2026-09-30" },
      [
        { ...issue({ id: 1, completedAt: "2026-08-10T12:00:00.000Z" }), objective_id: "another-objective" },
        issue({ id: 2, completedAt: "invalid" }),
        issue({ id: 3, completedAt: "2026-06-01T12:00:00.000Z" }),
        issue({ id: 4, status: "todo" }),
      ],
      NOW,
    );

    expect(result.periodCompleted).toBe(0);
    expect(result.forecastDate).toBeNull();
    expect(result.state).toBe("not_started");
  });

  it("recognizes an objective whose linked work is all closed", () => {
    const result = objectiveMomentum(
      OBJECTIVE,
      [
        issue({ id: 1, completedAt: "2026-09-01T08:00:00.000Z" }),
        issue({ id: 2, status: "canceled" }),
      ],
      NOW,
    );

    expect(result.state).toBe("complete");
    expect(result.remainingIssues).toBe(0);
  });

  it("shows full progress and no pending forecast or overdue signal for closed work", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, target_date: "2026-08-01" },
      [issue({ id: 1, completedAt: "2026-08-15T08:00:00.000Z" }), issue({ id: 2, status: "canceled" })],
      NOW,
    );

    expect(result).toMatchObject({
      state: "complete",
      progressPercent: 100,
      targetPace: null,
      forecastDate: null,
    });
  });

  it("suppresses momentum and forecasts for a canceled objective", () => {
    const result = objectiveMomentum(
      {
        ...OBJECTIVE,
        status: "canceled",
        target_date: "2026-08-01",
      },
      [
        issue({ id: 1, completedAt: "2026-09-01T08:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-08-29T08:00:00.000Z" }),
        issue({ id: 3, status: "todo" }),
      ],
      NOW,
    );

    expect(result).toMatchObject({
      state: "canceled",
      recentCompleted: 0,
      previousCompleted: 0,
      lastCompletionAt: null,
      forecastDate: null,
      forecastDays: null,
      targetPace: null,
      progressPercent: null,
      periodCompleted: 0,
    });
    expect(result.intervals.every((week) => week.completed === 0)).toBe(true);
  });
});
