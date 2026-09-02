import { describe, expect, it } from "vitest";
import { objectiveMomentum } from "./objective-momentum";

const NOW = new Date("2026-09-02T12:00:00.000Z");
const OBJECTIVE = {
  id: "objective-1",
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
    expect(result.weeks).toHaveLength(8);
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
    expect(result.weeks.at(-1)?.completed).toBe(2);
    expect(result.weeks.at(-2)?.completed).toBe(1);
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

  it("forecasts only after enough observed history and flags the target pace", () => {
    const result = objectiveMomentum(
      { ...OBJECTIVE, target_date: "2026-09-10" },
      [
        issue({ id: 1, completedAt: "2026-08-12T08:00:00.000Z" }),
        issue({ id: 2, completedAt: "2026-08-22T08:00:00.000Z" }),
        issue({ id: 3, status: "todo" }),
      ],
      NOW,
    );

    expect(result.forecastDays).toBe(14);
    expect(result.forecastDate).toBe("2026-09-16T12:00:00.000Z");
    expect(result.targetPace).toBe("at_risk");
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
});
