import { describe, expect, it } from "vitest";
import {
  addDays,
  blockedSet,
  computeTargetPoints,
  cycleCompletionPercent,
  cycleFilledPoints,
  cyclePhase,
  cycleStartOf,
  cycleWindows,
  diffDays,
  effortToPoints,
  fillCycle,
  isoDow,
  recoComparator,
  recoScore,
  type RecoIssue,
} from "./cycle";
import type { IssueRelation } from "./types";
import type { IssueStatus } from "./issue-constants";

const issue = (over: Partial<RecoIssue> & { id: string }): RecoIssue => ({
  project_id: "p1",
  title: over.id,
  status: "todo",
  priority: "none",
  effort: "m",
  category_ids: [],
  ...over,
});

const blocks = (source: string, target: string): IssueRelation => ({
  id: `${source}->${target}`,
  source_id: source,
  target_id: target,
  type: "blocks",
});

const statuses = (entries: Record<string, IssueStatus>) =>
  new Map(Object.entries(entries));

describe("dates", () => {
  it("does calendar arithmetic across DST switches", () => {
    // Europe DST switches in 2026: Mar 29 and Oct 25. Plain-day math must not
    // drift by an hour into the previous/next day.
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(diffDays("2026-03-23", "2026-03-30")).toBe(7);
    expect(diffDays("2026-10-19", "2026-10-26")).toBe(7);
  });

  it("computes ISO day of week", () => {
    expect(isoDow("1970-01-05")).toBe(1); // Monday
    expect(isoDow("2026-07-09")).toBe(4); // Thursday
    expect(isoDow("2026-07-12")).toBe(7); // Sunday
  });

  it("finds the Monday week window containing a date", () => {
    const cadence = { startDow: 1, durationWeeks: 1 as const };
    expect(cycleStartOf("2026-07-09", cadence)).toBe("2026-07-06");
    expect(cycleStartOf("2026-07-06", cadence)).toBe("2026-07-06"); // boundary day
    expect(cycleStartOf("2026-07-05", cadence)).toBe("2026-06-29"); // Sunday before
  });

  it("supports non-Monday starts", () => {
    const cadence = { startDow: 3, durationWeeks: 1 as const }; // Wednesday
    expect(cycleStartOf("2026-07-09", cadence)).toBe("2026-07-08");
    expect(cycleStartOf("2026-07-07", cadence)).toBe("2026-07-01");
  });

  it("keeps fortnight parity stable (epoch-anchored)", () => {
    const cadence = { startDow: 1, durationWeeks: 2 as const };
    const start = cycleStartOf("2026-07-09", cadence);
    // Same parity re-derived from any date inside the window.
    expect(cycleStartOf(start, cadence)).toBe(start);
    expect(cycleStartOf(addDays(start, 13), cadence)).toBe(start);
    expect(cycleStartOf(addDays(start, 14), cadence)).toBe(addDays(start, 14));
  });

  it("derives current + upcoming windows", () => {
    const windows = cycleWindows({ startDow: 1, durationWeeks: 1 }, "2026-07-09", 2);
    expect(windows).toEqual([
      { start_date: "2026-07-06", end_date: "2026-07-13" },
      { start_date: "2026-07-13", end_date: "2026-07-20" },
      { start_date: "2026-07-20", end_date: "2026-07-27" },
    ]);
  });

  it("classifies phases with an exclusive end", () => {
    const window = { start_date: "2026-07-06", end_date: "2026-07-13" };
    expect(cyclePhase(window, "2026-07-05")).toBe("future");
    expect(cyclePhase(window, "2026-07-06")).toBe("current");
    expect(cyclePhase(window, "2026-07-12")).toBe("current");
    expect(cyclePhase(window, "2026-07-13")).toBe("past");
  });
});

describe("points", () => {
  it("maps t-shirt sizes to Fibonacci, unsized to medium", () => {
    expect(effortToPoints("xs")).toBe(1);
    expect(effortToPoints("xl")).toBe(8);
    expect(effortToPoints(null)).toBe(3);
  });

  it("keeps the base target with fewer than 2 samples", () => {
    expect(computeTargetPoints("medium", [])).toBe(20);
    expect(computeTargetPoints("medium", [35])).toBe(20);
  });

  it("calibrates on the mean of recent completed points", () => {
    // mean(24, 28) = 26 → blend 0.5*20 + 0.5*26 = 23
    expect(computeTargetPoints("medium", [24, 28])).toBe(23);
    // Only the 3 most recent samples count.
    expect(computeTargetPoints("medium", [24, 28, 26, 999])).toBe(23);
  });

  it("clamps calibration to [0.6×, 1.6×] of the base", () => {
    expect(computeTargetPoints("medium", [0, 0])).toBe(12);
    expect(computeTargetPoints("medium", [500, 500])).toBe(32);
    expect(computeTargetPoints("light", [0, 0])).toBe(6);
  });

  it("sums filled points, ignoring canceled/duplicate", () => {
    expect(
      cycleFilledPoints([
        { effort: "xl", status: "todo" },
        { effort: "s", status: "done" },
        { effort: "l", status: "canceled" },
        { effort: null, status: "in_progress" },
      ])
    ).toBe(8 + 2 + 3);
  });

  it("computes points-weighted completion (done + canceled = dealt with)", () => {
    expect(
      cycleCompletionPercent([
        { effort: "xl", status: "todo" }, // 8 open
        { effort: "s", status: "done" }, // 2 closed
        { effort: "l", status: "canceled" }, // 5 closed
        { effort: null, status: "in_progress" }, // 3 open
      ])
    ).toBe(Math.round(((2 + 5) / 18) * 100)); // 39
    expect(
      cycleCompletionPercent([
        { effort: "m", status: "done" },
        { effort: "m", status: "todo" },
      ])
    ).toBe(50);
    expect(cycleCompletionPercent([])).toBeNull();
  });
});

describe("blocking", () => {
  it("flags issues whose blocker is still open", () => {
    const relations = [blocks("a", "b"), blocks("c", "d")];
    const map = statuses({ a: "todo", c: "done" });
    const blocked = blockedSet(["b", "d"], relations, map);
    expect(blocked.has("b")).toBe(true); // a is open
    expect(blocked.has("d")).toBe(false); // c is done
  });

  it("treats unknown blocker statuses as non-blocking", () => {
    const blocked = blockedSet(["b"], [blocks("ghost", "b")], statuses({}));
    expect(blocked.has("b")).toBe(false);
  });
});

describe("recoScore / recoComparator", () => {
  it("ranks priority above unblocked above small-first", () => {
    const urgent = issue({ id: "u", priority: "urgent", effort: "xl" });
    const small = issue({ id: "s", priority: "none", effort: "xs" });
    expect(recoScore(urgent, false)).toBeGreaterThan(recoScore(small, false));
  });

  it("orders a column: unblocked small urgent work first", () => {
    const a = issue({ id: "a", priority: "urgent", effort: "s" });
    const b = issue({ id: "b", priority: "urgent", effort: "s" });
    const c = issue({ id: "c", priority: "low", effort: "xs" });
    const cmp = recoComparator([blocks("x", "b")], statuses({ x: "todo" }));
    expect([b, c, a].sort(cmp).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("applies steering boosts", () => {
    const ui = issue({ id: "ui", title: "Fix UI overflow" });
    const api = issue({ id: "api", title: "API cleanup" });
    const weights = { keywordBoost: [{ keyword: "ui", weight: 100 }] };
    expect(recoScore(ui, false, weights)).toBeGreaterThan(recoScore(api, false, weights));

    const boosted = issue({ id: "p", project_id: "proj-x" });
    expect(
      recoScore(boosted, false, { projectBoost: { "proj-x": 50 } })
    ).toBe(recoScore(boosted, false) + 50);
  });
});

describe("fillCycle", () => {
  it("fills up to the target, small-first on equal priority", () => {
    const { picked, points } = fillCycle({
      candidates: [
        issue({ id: "a", effort: "xl" }), // 8
        issue({ id: "b", effort: "s" }), // 2
        issue({ id: "c", effort: "xs" }), // 1
      ],
      relations: [],
      statusById: statuses({}),
      targetPoints: 3,
    });
    expect(picked.sort()).toEqual(["b", "c"]);
    expect(points).toBe(3);
  });

  it("prefers priority over size", () => {
    const { picked } = fillCycle({
      candidates: [
        issue({ id: "big-urgent", priority: "urgent", effort: "l" }), // 5
        issue({ id: "small-none", priority: "none", effort: "xs" }), // 1
      ],
      relations: [],
      statusById: statuses({}),
      targetPoints: 5,
    });
    expect(picked).toEqual(["big-urgent"]);
  });

  it("never picks a blocked issue unless its blocker is picked too", () => {
    // a blocks b; both candidates. a scores lower alone but must come first.
    const a = issue({ id: "a", priority: "low", effort: "s" });
    const b = issue({ id: "b", priority: "urgent", effort: "s" });
    const { picked } = fillCycle({
      candidates: [a, b],
      relations: [blocks("a", "b")],
      statusById: statuses({ a: "todo", b: "todo" }),
      targetPoints: 4,
    });
    // Both fit: a gets picked (b blocked at first), then b unblocks.
    expect(picked.sort()).toEqual(["a", "b"]);
  });

  it("skips an issue whose blocker is outside the pool and open", () => {
    const { picked } = fillCycle({
      candidates: [issue({ id: "b", priority: "urgent" })],
      relations: [blocks("ext", "b")],
      statusById: statuses({ ext: "in_progress", b: "todo" }),
      targetPoints: 10,
    });
    expect(picked).toEqual([]);
  });

  it("undershoots rather than overshooting", () => {
    const { picked, points } = fillCycle({
      candidates: [
        issue({ id: "a", effort: "xl" }), // 8
        issue({ id: "b", effort: "xl" }), // 8
      ],
      relations: [],
      statusById: statuses({}),
      targetPoints: 10,
    });
    expect(picked).toEqual(["a"]);
    expect(points).toBe(8);
  });

  it("falls back to one oversized pick rather than an empty cycle", () => {
    const { picked, points } = fillCycle({
      candidates: [issue({ id: "huge", effort: "xl" })],
      relations: [],
      statusById: statuses({}),
      targetPoints: 6,
    });
    expect(picked).toEqual(["huge"]);
    expect(points).toBe(8);
  });

  it("does NOT overshoot when the cycle already has content", () => {
    const { picked } = fillCycle({
      candidates: [issue({ id: "huge", effort: "xl" })],
      relations: [],
      statusById: statuses({}),
      targetPoints: 6,
      alreadyFilledPoints: 5,
    });
    expect(picked).toEqual([]);
  });

  it("accounts for already-filled points", () => {
    const { points } = fillCycle({
      candidates: [
        issue({ id: "a", effort: "l" }), // 5
        issue({ id: "b", effort: "s" }), // 2
      ],
      relations: [],
      statusById: statuses({}),
      targetPoints: 10,
      alreadyFilledPoints: 7,
    });
    expect(points).toBe(2); // only b fits the 3 remaining
  });

  it("is deterministic", () => {
    const candidates = [
      issue({ id: "c", effort: "m", priority: "high" }),
      issue({ id: "a", effort: "s", priority: "high" }),
      issue({ id: "b", effort: "s", priority: "high" }),
    ];
    const run = () =>
      fillCycle({
        candidates: [...candidates].reverse(),
        relations: [],
        statusById: statuses({}),
        targetPoints: 4,
      });
    expect(run()).toEqual(run());
    expect(run().picked.sort()).toEqual(["a", "b"]);
  });
});
