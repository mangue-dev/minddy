import { describe, expect, it } from "vitest";

import {
  DEFAULT_SMART_TRIAGE_MODE,
  MAX_TRIAGE_TICKETS_PER_DECISION,
  TRIAGE_NEUTRAL_SCORE,
  jevTriageOrder,
  parseSmartTriageMode,
  triageAgeDays,
  triageIssueComparator,
  type TriageIssue,
} from "./smart-triage";
import type { IssueStatus } from "./issue-constants";
import type { IssueRelation } from "./types";

/**
 * The static rules of Smart Triage (MIN-566), pinned as a contract: relations
 * pass above everything, quick wins reorder the middle, objectives stay
 * together, and the whole order is stable on its own tie-breaks. A regression
 * here reads as "the button shuffled my board for nothing".
 */

function ticket(overrides: Partial<TriageIssue> & { id: string }): TriageIssue {
  return {
    priority: "medium",
    effort: null,
    due_date: null,
    // Fixed stamps so the age tie-break is deterministic: id-1 created first.
    created_at: `2026-09-01T10:00:00Z`,
    position: 0,
    objective_id: null,
    ...overrides,
  };
}

function order(issues: TriageIssue[], ctx: Omit<Parameters<typeof triageIssueComparator>[0], "issues"> = {}): string[] {
  const comparator = triageIssueComparator({
    ...ctx,
    issues,
    now: ctx.now ?? Date.parse("2026-09-14T12:00:00Z"),
  });
  return [...issues].sort(comparator).map((i) => i.id);
}

describe("parseSmartTriageMode", () => {
  it("accepts the three known values only", () => {
    expect(parseSmartTriageMode("off")).toBe("off");
    expect(parseSmartTriageMode("rules")).toBe("rules");
    expect(parseSmartTriageMode("jev")).toBe("jev");
    expect(parseSmartTriageMode("smart")).toBeNull();
    expect(parseSmartTriageMode(undefined)).toBeNull();
    expect(parseSmartTriageMode(null)).toBeNull();
    expect(parseSmartTriageMode(1)).toBeNull();
  });

  it("defaults to rules once the triage is on", () => {
    // Phase A is the default behavior of the mode: arming the triage without
    // choosing must never arm the AI pass by accident (MIN-557).
    expect(DEFAULT_SMART_TRIAGE_MODE).toBe("rules");
  });
});

describe("triageIssueComparator — relations pass above everything", () => {
  const relations: IssueRelation[] = [
    { id: "r1", source_id: "a", target_id: "b", type: "blocks" },
  ];
  const statusById = new Map<IssueStatus | string, IssueStatus>();

  it("lifts an open blocker to the top tier and sinks its target", () => {
    const issues = [
      ticket({ id: "b", priority: "urgent" }), // blocked by a
      ticket({ id: "a", priority: "low" }), // blocks b
      ticket({ id: "c", priority: "medium" }),
    ];
    expect(order(issues, { relations, statusById })).toEqual(["a", "c", "b"]);
  });

  it("stops lifting a blocker whose target is closed", () => {
    const doneStatus = new Map<string, IssueStatus>([["b", "done"]]);
    const issues = [
      ticket({ id: "b", priority: "urgent" }),
      ticket({ id: "a", priority: "low" }),
      ticket({ id: "c", priority: "medium" }),
    ];
    // The edge is dead, so everyone reads on their own rank: urgent, medium,
    // low.
    expect(order(issues, { relations, statusById: doneStatus })).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("reads related edges as information, never as order", () => {
    const related: IssueRelation[] = [
      { id: "r1", source_id: "a", target_id: "b", type: "related" },
    ];
    const issues = [
      ticket({ id: "b", priority: "low" }),
      ticket({ id: "a", priority: "high" }),
    ];
    expect(order(issues, { relations: related, statusById })).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("triageIssueComparator — quick wins", () => {
  it("puts low-effort high-priority ahead of high-effort high-priority", () => {
    const issues = [
      ticket({ id: "xl", priority: "urgent", effort: "xl" }),
      ticket({ id: "xs", priority: "high", effort: "xs" }),
    ];
    // urgent+xl = 0 − (−0.5) = 0.5; high+xs = 1 − 1.5 = −0.5: the quick win
    // passes the expensive urgent.
    expect(order(issues)).toEqual(["xs", "xl"]);
  });

  it("never lets effort override an extreme priority gap", () => {
    const issues = [
      ticket({ id: "urgent-xl", priority: "urgent", effort: "xl" }),
      ticket({ id: "low-xs", priority: "low", effort: "xs" }),
    ];
    expect(order(issues)).toEqual(["urgent-xl", "low-xs"]);
  });

  it("lifts an imminent due date like the smart view sort does", () => {
    const issues = [
      ticket({ id: "dated", priority: "medium", due_date: "2026-09-16" }),
      ticket({ id: "undated", priority: "high" }),
    ];
    // now = 2026-09-14: the medium ticket due in 2 days passes the undated high.
    expect(order(issues)).toEqual(["dated", "undated"]);
  });

  it("breaks ties by age, oldest first", () => {
    const issues = [
      ticket({ id: "new", created_at: "2026-09-10T10:00:00Z" }),
      ticket({ id: "old", created_at: "2026-09-01T10:00:00Z" }),
    ];
    expect(order(issues)).toEqual(["old", "new"]);
  });

  it("ends on the manual position so an unchanged triage is stable", () => {
    const issues = [
      ticket({ id: "second", position: 2 }),
      ticket({ id: "first", position: 1 }),
    ];
    expect(order(issues)).toEqual(["first", "second"]);
  });
});

describe("triageIssueComparator — objectives stay together", () => {
  it("keeps tickets of one objective contiguous, ordered by the block's best", () => {
    const issues = [
      ticket({ id: "obj-low", priority: "low", objective_id: "obj-1" }),
      ticket({ id: "solo-urgent", priority: "urgent" }),
      ticket({ id: "obj-high", priority: "high", objective_id: "obj-1" }),
      ticket({ id: "solo-medium", priority: "medium" }),
    ];
    // The obj-1 block ranks by its best (high): it lands between the urgent
    // solo and the medium solo, with its members in quick-win order.
    expect(order(issues)).toEqual([
      "solo-urgent",
      "obj-high",
      "obj-low",
      "solo-medium",
    ]);
  });

  it("groups within a tier only: a blocker still passes above its objective mates", () => {
    const relations: IssueRelation[] = [
      { id: "r1", source_id: "obj-blocker", target_id: "solo", type: "blocks" },
    ];
    const issues = [
      ticket({ id: "solo", priority: "medium" }),
      ticket({ id: "obj-blocker", priority: "low", objective_id: "obj-1" }),
      ticket({ id: "obj-mate", priority: "urgent", objective_id: "obj-1" }),
    ];
    expect(order(issues, { relations, statusById: new Map() })).toEqual([
      "obj-blocker",
      "obj-mate",
      "solo",
    ]);
  });
});

describe("jevTriageOrder", () => {
  it("orders by score, highest first, oldest first on ties", () => {
    const issues = [
      ticket({ id: "a", created_at: "2026-09-10T10:00:00Z" }),
      ticket({ id: "b", created_at: "2026-09-01T10:00:00Z" }),
      ticket({ id: "c", created_at: "2026-09-05T10:00:00Z" }),
    ];
    const scores = new Map([
      ["a", 3],
      ["b", 5],
      ["c", 3],
    ]);
    expect(jevTriageOrder(issues, scores).map((i) => i.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("reads a missing score as neutral, never as first or last", () => {
    const issues = [
      ticket({ id: "unscored", created_at: "2026-09-01T10:00:00Z" }),
      ticket({ id: "high", created_at: "2026-09-10T10:00:00Z" }),
      ticket({ id: "low", created_at: "2026-09-10T10:00:00Z" }),
    ];
    const scores = new Map<string, number | null>([
      ["high", 5],
      ["low", 1],
      ["unscored", null],
    ]);
    expect(jevTriageOrder(issues, scores).map((i) => i.id)).toEqual([
      "high",
      "unscored",
      "low",
    ]);
    expect(TRIAGE_NEUTRAL_SCORE).toBe(3);
  });
});

describe("triageAgeDays", () => {
  it("counts whole calendar days waited", () => {
    // 2026-09-14 → 2026-09-10: four days.
    expect(triageAgeDays("2026-09-10T10:00:00Z", Date.parse("2026-09-14T12:00:00Z"))).toBe(4);
  });

  it("clamps a future (or unparseable) creation to zero", () => {
    expect(triageAgeDays("2026-09-20T10:00:00Z", Date.parse("2026-09-14T12:00:00Z"))).toBe(0);
    expect(triageAgeDays("not-a-date", Date.parse("2026-09-14T12:00:00Z"))).toBe(0);
  });
});

describe("MAX_TRIAGE_TICKETS_PER_DECISION", () => {
  it("keeps one decision inside both engines' reach", () => {
    // The LLM fallback answers one score per ticket in a single forced call;
    // past a few dozen the tool schema (and the bill) stop making sense.
    expect(MAX_TRIAGE_TICKETS_PER_DECISION).toBeLessThanOrEqual(50);
  });
});
