import { describe, expect, it } from "vitest";

import {
  DEFAULT_SMART_TRIAGE_MODE,
  MAX_TRIAGE_TICKETS_PER_DECISION,
  TRIAGE_NEUTRAL_SCORE,
  jevTriageOrder,
  parseSmartTriageMode,
  triageAgeDays,
  triageIssueComparator,
  boardComparatorFactory,
  type TriageIssue,
} from "./smart-triage";
import type { Issue } from "./types";
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
  it("accepts the two known values only (MIN-575: off is retired)", () => {
    expect(parseSmartTriageMode("rules")).toBe("rules");
    expect(parseSmartTriageMode("jev")).toBe("jev");
    expect(parseSmartTriageMode("off")).toBeNull();
    expect(parseSmartTriageMode("smart")).toBeNull();
    expect(parseSmartTriageMode(undefined)).toBeNull();
    expect(parseSmartTriageMode(null)).toBeNull();
    expect(parseSmartTriageMode(1)).toBeNull();
  });

  it("defaults to rules — never the AI pass by accident", () => {
    // Rules is the default behavior of the mode: a project (or a retired
    // `off` row) without a choice must never arm the AI pass by accident
    // (MIN-557).
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

  it("keeps two tied blocks contiguous — members never interleave across groups", () => {
    // The pinned regression: two objective blocks whose BEST ranks tie must
    // be emitted whole. Comparing members individually would emit
    // a1, b1, b2, a2 — both blocks torn apart.
    const issues = [
      ticket({ id: "a2", priority: "low", objective_id: "obj-1", position: 4 }),
      ticket({ id: "b2", priority: "medium", objective_id: "obj-2", position: 3 }),
      ticket({ id: "a1", priority: "urgent", objective_id: "obj-1", position: 1 }),
      ticket({ id: "b1", priority: "urgent", objective_id: "obj-2", position: 2 }),
    ];
    const result = order(issues);
    expect(result).toEqual(["a1", "a2", "b1", "b2"]);
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

describe("boardComparatorFactory (MIN-576)", () => {
  const NOW = Date.parse("2026-09-14T12:00:00Z");

  /** The comparator's board shape: a full Issue cast — the factory serves
   * the kanban boards, whose rows are Issues. */
  const boardTicket = (overrides: Partial<TriageIssue> & { id: string }): Issue =>
    ticket(overrides) as unknown as Issue;

  function sorted(issues: Issue[], sort: Parameters<typeof boardComparatorFactory>[0], ctx: Parameters<typeof boardComparatorFactory>[1] = {}): string[] {
    const make = boardComparatorFactory(sort, { now: NOW, ...ctx });
    return [...issues].sort(make(issues)).map((i) => i.id);
  }

  it("applies the FULL triage rules in rules mode — the same order the server reorder writes", () => {
    // A blocker rises above the middle tier, its blocked target sinks below,
    // the xs quick win passes the xl high, the objective pair stays together.
    const issues = [
      boardTicket({ id: "a", priority: "urgent", position: 10 }),
      boardTicket({ id: "b", priority: "low", position: 20 }),
      boardTicket({ id: "c", priority: "medium", position: 30 }),
      boardTicket({ id: "d", priority: "high", effort: "xl", position: 40 }),
      boardTicket({ id: "e", priority: "medium", effort: "xs", objective_id: "obj-1", position: 50 }),
      boardTicket({ id: "f", priority: "high", effort: "xs", objective_id: "obj-1", position: 60 }),
    ];
    const relations: IssueRelation[] = [
      { id: "r1", source_id: "b", target_id: "a", type: "blocks" },
    ];
    expect(sorted(issues, "smart", { relations })).toEqual(["b", "f", "e", "d", "c", "a"]);
  });

  it("keeps the per-column grouping: the rules read the column's own issue set", () => {
    // The same objective split across two calls (two columns) groups per
    // column — a global comparator would tear it across statuses.
    const issues = [
      boardTicket({ id: "a", objective_id: "obj-1", position: 10 }),
      boardTicket({ id: "b", objective_id: "obj-1", position: 20 }),
      boardTicket({ id: "z", objective_id: "obj-2", effort: "xs", position: 30 }),
    ];
    const make = boardComparatorFactory("smart", { now: NOW });
    const columnA = [...issues.slice(0, 2)].sort(make(issues.slice(0, 2))).map((i) => i.id);
    const columnB = [...issues.slice(2)].sort(make(issues.slice(2))).map((i) => i.id);
    expect(columnA).toEqual(["a", "b"]);
    expect(columnB).toEqual(["z"]);
  });

  it("hybrid: ranked tickets compare by score, the others keep the rules ranking", () => {
    const issues = [
      boardTicket({ id: "a", priority: "urgent", position: 10 }),
      boardTicket({ id: "b", priority: "low", position: 20 }),
      boardTicket({ id: "c", priority: "low", due_date: "2026-09-15", position: 30 }),
      boardTicket({ id: "d", priority: "medium", position: 40 }),
    ];
    const scores = new Map<string, number | null>([["d", 2]]);
    const ordered = sorted(issues, "smart", { jevScores: scores });
    // d (scored, even at a low 2) outranks the unranked ones; among them
    // the rules stand (a's urgent tier, then c's imminent due date passing
    // b's plain low) — NOT age/position.
    expect(ordered).toEqual(["d", "a", "c", "b"]);
  });

  it("delegates the other sorts to the view comparator, column-blind", () => {
    const issues = [
      boardTicket({ id: "a", position: 20 }),
      boardTicket({ id: "b", position: 10 }),
    ];
    expect(sorted(issues, "manual")).toEqual(["b", "a"]);
  });
});
