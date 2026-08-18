import { describe, expect, it } from "vitest";
import {
  computeStreaks,
  dayInZone,
  durationParts,
  heatmapTotals,
  projectShare,
  projectsTotal,
} from "./stats-derive";
import type { HeatmapDay, StatProjectBucket } from "./types";

/** Dense series from daily accounts — the date does not matter here,
 * only the position (the last element = today) carries meaning. */
const days = (counts: number[]): HeatmapDay[] =>
  counts.map((count, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    count,
    issues: count,
    tasks: 0,
  }));

const bucket = (over: Partial<StatProjectBucket>): StatProjectBucket => ({
  name: "p",
  color: null,
  deleted: false,
  created: 0,
  completed: 0,
  ...over,
});

describe("computeStreaks", () => {
  it("counts the run ending today", () => {
    expect(computeStreaks(days([0, 1, 1, 1])).current).toBe(3);
  });

  it("does not break the streak when today is still empty", () => {
    // The current day has not yet been played: the 2 days before count.
    expect(computeStreaks(days([0, 1, 1, 0])).current).toBe(2);
  });

  it("breaks the streak on a gap before today", () => {
    expect(computeStreaks(days([1, 1, 0, 0])).current).toBe(0);
  });

  it("reports the longest run of the window", () => {
    expect(computeStreaks(days([1, 1, 1, 1, 0, 1])).longest).toBe(4);
  });

  it("handles an empty window", () => {
    expect(computeStreaks([])).toEqual({ current: 0, longest: 0 });
  });
});

describe("durationParts", () => {
  it("uses minutes below 90 minutes", () => {
    expect(durationParts(45 * 60)).toEqual({ key: "durationMinutes", value: 45 });
  });

  it("switches to hours at 90 minutes", () => {
    expect(durationParts(90 * 60)).toEqual({ key: "durationHours", value: 1.5 });
  });

  it("switches to days at 48 hours", () => {
    expect(durationParts(48 * 3600)).toEqual({ key: "durationDays", value: 2 });
  });

  it("rounds to one decimal", () => {
    expect(durationParts(3.26 * 86400)).toEqual({ key: "durationDays", value: 3.3 });
  });
});

describe("heatmapTotals", () => {
  it("sums the window and counts active days", () => {
    const window: HeatmapDay[] = [
      { date: "2026-01-01", count: 3, issues: 2, tasks: 1 },
      { date: "2026-01-02", count: 0, issues: 0, tasks: 0 },
      { date: "2026-01-03", count: 2, issues: 0, tasks: 2 },
    ];
    expect(heatmapTotals(window)).toEqual({
      total: 5,
      issues: 2,
      tasks: 3,
      activeDays: 2,
    });
  });

  it("is zero on an empty window", () => {
    expect(heatmapTotals([])).toEqual({
      total: 0,
      issues: 0,
      tasks: 0,
      activeDays: 0,
    });
  });
});

describe("projectShare", () => {
  it("returns a whole percentage of the total", () => {
    expect(projectShare(bucket({ completed: 25 }), 100)).toBe(25);
  });

  it("returns 0 when nothing was completed anywhere", () => {
    expect(projectShare(bucket({ completed: 0 }), 0)).toBe(0);
  });
});

describe("dayInZone", () => {
  it("buckets an instant into its local calendar day", () => {
    // 10 p.m. UTC = already the next day in Paris (UTC+2 in summer).
    expect(dayInZone("2026-05-17T22:30:00Z", "Europe/Paris")).toBe("2026-05-18");
    expect(dayInZone("2026-05-17T22:30:00Z", "UTC")).toBe("2026-05-17");
  });

  it("handles zones behind UTC", () => {
    // 02 a.m. UTC = still the day before in New York.
    expect(dayInZone("2026-05-17T02:00:00Z", "America/New_York")).toBe("2026-05-16");
  });

  it("returns null on a missing or invalid instant", () => {
    expect(dayInZone(null, "UTC")).toBeNull();
    expect(dayInZone("", "UTC")).toBeNull();
    expect(dayInZone("not-a-date", "UTC")).toBeNull();
  });

  it("falls back to UTC on an unknown zone", () => {
    expect(dayInZone("2026-05-17T12:00:00Z", "Not/AZone")).toBe("2026-05-17");
  });
});

describe("projectsTotal", () => {
  it("sums completed across buckets, deleted projects included", () => {
    expect(
      projectsTotal([
        bucket({ completed: 4 }),
        bucket({ completed: 6, deleted: true }),
      ]),
    ).toBe(10);
  });
});
