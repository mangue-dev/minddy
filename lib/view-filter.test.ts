import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  activeFilterCount,
  configsEqual,
  filterIssues,
  isDefaultConfig,
  issueComparator,
  storedStatusFilter,
  toggleStatusFilter,
  visibleStatuses,
} from "./view-filter";
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

describe("default status columns (MIN-736)", () => {
  const columns = (config = DEFAULT_CONFIG) =>
    visibleStatuses(config).map((s) => s.value);
  const withStatus = (status: IssueStatus[]) => ({
    ...DEFAULT_CONFIG,
    filters: { status },
  });

  it("shows only the open columns without a status filter", () => {
    expect(columns()).toEqual(["backlog", "todo", "in_progress", "in_review"]);
    const shown = filterIssues(
      [
        issue("open", { status: "in_review" }),
        issue("done", { status: "done" }),
        issue("canceled", { status: "canceled" }),
      ],
      DEFAULT_CONFIG,
      { myUserId: null }
    ).map((i) => i.id);
    expect(shown).toEqual(["open"]);
  });

  it("brings Done and Canceled back when the filter selects them", () => {
    const all = withStatus(["backlog", "todo", "in_progress", "in_review", "done", "canceled"]);
    expect(columns(all)).toEqual([
      "backlog", "todo", "in_progress", "in_review", "done", "canceled",
    ]);
    expect(filterIssues([issue("done", { status: "done" })], all, { myUserId: null }))
      .toHaveLength(1);
    expect(columns(withStatus(["done"]))).toEqual(["done"]);
  });

  it("keeps hideDone on top of an explicit selection", () => {
    const config = { ...withStatus(["todo", "done"]), display: { hideDone: true } };
    expect(columns(config)).toEqual(["todo"]);
  });

  it("treats the open selection as the default, not as a change", () => {
    const explicit = withStatus(["in_review", "backlog", "todo", "in_progress"]);
    expect(isDefaultConfig(DEFAULT_CONFIG)).toBe(true);
    expect(isDefaultConfig(explicit)).toBe(true);
    expect(configsEqual(explicit, DEFAULT_CONFIG)).toBe(true);
    expect(activeFilterCount(explicit)).toBe(0);
    expect(isDefaultConfig(withStatus(["todo"]))).toBe(false);
    expect(activeFilterCount(withStatus(["todo", "done"]))).toBe(1);
  });

  it("toggles from the open statuses when nothing is stored", () => {
    expect(toggleStatusFilter(undefined, "done")).toEqual([
      "backlog", "todo", "in_progress", "in_review", "done",
    ]);
    expect(toggleStatusFilter(undefined, "backlog")).toEqual([
      "todo", "in_progress", "in_review",
    ]);
    // Removing Done again lands back on the default: nothing to store.
    expect(
      toggleStatusFilter(["backlog", "todo", "in_progress", "in_review", "done"], "done")
    ).toBeUndefined();
  });

  it("stores the default selection as no filter", () => {
    expect(storedStatusFilter(["backlog", "todo", "in_progress", "in_review"])).toBeUndefined();
    expect(storedStatusFilter([])).toBeUndefined();
    expect(storedStatusFilter(["todo", "done"])).toEqual(["todo", "done"]);
  });
});
