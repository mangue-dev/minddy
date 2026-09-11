import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, isDefaultConfig, issueComparator } from "./view-filter";
import type { Issue, IssueRelation } from "./types";
import type { IssuePriority, IssueStatus } from "./issue-constants";

/** Frozen "now": 2026-07-28 10:00 local. */
const NOW = new Date(2026, 6, 28, 10, 0).getTime();

/** A local date N days from NOW (negative = past). */
function day(days: number): string {
  const d = new Date(NOW + days * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function issue(
  id: string,
  fields: {
    priority?: IssuePriority;
    due_date?: string | null;
    position?: number;
    status?: IssueStatus;
  } = {}
): Issue {
  return {
    id,
    priority: "medium",
    due_date: null,
    position: 0,
    status: "todo",
    ...fields,
  } as Issue;
}

function order(issues: Issue[], relations?: IssueRelation[]): string[] {
  return [...issues].sort(issueComparator("smart", { relations, statusById: new Map(issues.map((i) => [i.id, i.status])), now: NOW })).map((i) => i.id);
}

const blocks = (source: string, target: string): IssueRelation => ({
  id: `${source}->${target}`,
  source_id: source,
  target_id: target,
  type: "blocks",
});

describe("smart sort — the priority arrangement as the baseline", () => {
  it("orders by priority, then manual position, when nothing lifts", () => {
    const issues = [
      issue("low", { priority: "low", position: 5 }),
      issue("high", { priority: "high", position: 5 }),
      issue("urgent", { priority: "urgent", position: 9 }),
      issue("medium", { position: 2 }),
    ];
    expect(order(issues)).toEqual(["urgent", "high", "medium", "low"]);
  });

  it("is the default sort of every board", () => {
    expect(DEFAULT_CONFIG.sort).toBe("smart");
    expect(isDefaultConfig({ ...DEFAULT_CONFIG })).toBe(true);
  });
});

describe("smart sort — due dates lift", () => {
  it("a medium ticket due tomorrow passes an undated high (MIN-510)", () => {
    const issues = [
      issue("high", { priority: "high" }),
      issue("due-soon", { due_date: day(1) }),
    ];
    expect(order(issues)).toEqual(["due-soon", "high"]);
  });

  it("an overdue medium passes an undated urgent", () => {
    const issues = [
      issue("urgent", { priority: "urgent" }),
      issue("late", { due_date: day(-2) }),
    ];
    expect(order(issues)).toEqual(["late", "urgent"]);
  });

  it("the lift fades over a fortnight: a due date 20 days out lifts nothing", () => {
    const issues = [
      issue("high", { priority: "high" }),
      issue("far", { priority: "medium", due_date: day(20) }),
    ];
    expect(order(issues)).toEqual(["high", "far"]);
  });

  it("two equal ranks read the due date, undated last, then position", () => {
    const issues = [
      issue("b", { due_date: day(5), position: 0 }),
      issue("a", { due_date: day(2), position: 9 }),
      issue("c", { position: 1 }),
      issue("d", { due_date: day(5), position: 7 }),
    ];
    expect(order(issues)).toEqual(["a", "b", "d", "c"]);
  });
});

describe("smart sort — blockers lift", () => {
  it("a medium ticket blocking an open ticket passes an undated high", () => {
    const issues = [
      issue("high", { priority: "high" }),
      issue("blocker", {}),
      issue("blocked", { status: "todo" }),
    ];
    expect(order(issues, [blocks("blocker", "blocked")])).toEqual([
      "blocker",
      "high",
      "blocked",
    ]);
  });

  it("a closed target no longer lifts its blocker", () => {
    const issues = [
      issue("high", { priority: "high" }),
      issue("blocker", {}),
      issue("done-target", { status: "done" }),
    ];
    expect(order(issues, [blocks("blocker", "done-target")])).toEqual([
      "high",
      "blocker",
      "done-target",
    ]);
  });

  it("a resolved blocker (itself closed) is not lifted", () => {
    const issues = [
      issue("high", { priority: "high" }),
      issue("blocker", { status: "done" }),
      issue("blocked", { status: "todo" }),
    ];
    expect(order(issues, [blocks("blocker", "blocked")])).toEqual([
      "high",
      "blocker",
      "blocked",
    ]);
  });

  it("an unknown target status is not counted as blocked", () => {
    const issues = [
      issue("high", { priority: "high" }),
      issue("blocker", {}),
    ];
    // No statusById entry for the target — treated as non-blocking.
    const sorted = [...issues].sort(
      issueComparator("smart", {
        relations: [blocks("blocker", "ghost")],
        statusById: new Map([["high", "todo"], ["blocker", "todo"]]),
        now: NOW,
      })
    );
    expect(sorted.map((i) => i.id)).toEqual(["high", "blocker"]);
  });
});

describe("smart sort — stacked boosts and fallbacks", () => {
  it("due date and blocks boosts stack on top of each other", () => {
    const issues = [
      issue("urgent", { priority: "urgent" }),
      issue("both", { priority: "low", due_date: day(1) }),
      issue("blocked", { status: "todo" }),
    ];
    expect(order(issues, [blocks("both", "blocked")])).toEqual([
      "both",
      "urgent",
      "blocked",
    ]);
  });

  it("without relations in context, smart still applies the due boosts", () => {
    const issues = [
      issue("high", { priority: "high" }),
      issue("due-soon", { due_date: day(1) }),
    ];
    const sorted = [...issues].sort(issueComparator("smart", { now: NOW }));
    expect(sorted.map((i) => i.id)).toEqual(["due-soon", "high"]);
  });
});
