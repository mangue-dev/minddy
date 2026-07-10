import { describe, expect, it } from "vitest";
import {
  CATEGORY_COALESCE_MS,
  UNDO_STACK_LIMIT,
  buildBeforePatch,
  pushEntry,
  resolveAliased,
  snapshotIssue,
  type UndoEntry,
} from "./undo-core";
import type { Issue } from "../types";

const ISSUE: Issue = {
  id: "issue-1",
  project_id: "project-1",
  number: 42,
  title: "Fix the flux capacitor",
  description: "It fluxes too much",
  plan: null,
  status: "todo",
  priority: "medium",
  effort: "m",
  assignee_id: "user-1",
  objective_id: null,
  parent_id: null,
  duplicate_of_id: null,
  due_date: null,
  position: 1000,
  created_by: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  completed_at: null,
  cycle_id: null,
  category_ids: ["cat-1"],
};

function updateEntry(issueId: string, at: number): UndoEntry {
  return {
    kind: "update",
    projectId: "project-1",
    issueId,
    before: { status: "todo" },
    after: { status: "done" },
    at,
  };
}

function categoriesEntry(
  issueId: string,
  before: string[],
  after: string[],
  at: number
): UndoEntry {
  return { kind: "categories", projectId: "project-1", issueId, before, after, at };
}

describe("buildBeforePatch", () => {
  it("captures the issue's current value for each patched key", () => {
    expect(
      buildBeforePatch(ISSUE, { status: "done", assignee_id: "user-2" })
    ).toEqual({ status: "todo", assignee_id: "user-1" });
  });

  it("uses explicit nulls so cleared fields round-trip through JSON", () => {
    const issue = { ...ISSUE, due_date: null, effort: null };
    expect(buildBeforePatch(issue, { due_date: "2026-08-01", effort: "xl" })).toEqual({
      due_date: null,
      effort: null,
    });
  });

  it("returns null when the patch is a no-op", () => {
    expect(buildBeforePatch(ISSUE, { status: "todo" })).toBeNull();
    expect(buildBeforePatch(ISSUE, { objective_id: null })).toBeNull();
  });

  it("treats a single changed key among identical ones as a change", () => {
    expect(buildBeforePatch(ISSUE, { status: "todo", priority: "high" })).toEqual({
      status: "todo",
      priority: "medium",
    });
  });
});

describe("snapshotIssue", () => {
  it("keeps every field the re-creation needs", () => {
    expect(snapshotIssue(ISSUE)).toEqual({
      title: "Fix the flux capacitor",
      description: "It fluxes too much",
      plan: null,
      status: "todo",
      priority: "medium",
      effort: "m",
      assignee_id: "user-1",
      objective_id: null,
      parent_id: null,
      duplicate_of_id: null,
      due_date: null,
      position: 1000,
      cycle_id: null,
      category_ids: ["cat-1"],
    });
  });
});

describe("resolveAliased", () => {
  it("returns the id itself when unaliased", () => {
    expect(resolveAliased(new Map(), "issue-1")).toBe("issue-1");
  });

  it("follows re-creation chains to the latest id", () => {
    const alias = new Map([
      ["issue-1", "issue-2"],
      ["issue-2", "issue-3"],
    ]);
    expect(resolveAliased(alias, "issue-1")).toBe("issue-3");
    expect(resolveAliased(alias, "issue-2")).toBe("issue-3");
  });

  it("stays bounded on a (theoretically impossible) cycle", () => {
    const alias = new Map([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(["a", "b"]).toContain(resolveAliased(alias, "a"));
  });
});

describe("pushEntry", () => {
  it("appends regular entries and returns the pushed entry", () => {
    const stack: UndoEntry[] = [];
    const first = updateEntry("issue-1", 0);
    expect(pushEntry(stack, first)).toBe(first);
    pushEntry(stack, updateEntry("issue-1", 10));
    expect(stack).toHaveLength(2);
  });

  it("coalesces rapid category toggles in place, returning the canonical entry", () => {
    const stack: UndoEntry[] = [];
    const first = categoriesEntry("issue-1", ["a"], ["a", "b"], 0);
    pushEntry(stack, first);
    const merged = pushEntry(
      stack,
      categoriesEntry("issue-1", ["a", "b"], ["a", "b", "c"], 500)
    );
    pushEntry(stack, categoriesEntry("issue-1", ["a", "b", "c"], ["a"], 900));
    expect(stack).toHaveLength(1);
    // Identity preserved so holders can retract / update `after` live.
    expect(merged).toBe(first);
    expect(stack[0]).toBe(first);
    expect(stack[0]).toMatchObject({ before: ["a"], after: ["a"], at: 900 });
  });

  it("does not coalesce beyond the window, across issues, or across kinds", () => {
    const stack: UndoEntry[] = [];
    pushEntry(stack, categoriesEntry("issue-1", ["a"], ["b"], 0));
    pushEntry(
      stack,
      categoriesEntry("issue-1", ["b"], ["c"], CATEGORY_COALESCE_MS + 1)
    );
    expect(stack).toHaveLength(2);

    pushEntry(
      stack,
      categoriesEntry("issue-2", ["x"], ["y"], CATEGORY_COALESCE_MS + 2)
    );
    expect(stack).toHaveLength(3);

    pushEntry(stack, updateEntry("issue-2", CATEGORY_COALESCE_MS + 3));
    pushEntry(
      stack,
      categoriesEntry("issue-2", ["y"], ["z"], CATEGORY_COALESCE_MS + 4)
    );
    expect(stack).toHaveLength(5);
  });

  it("drops the oldest entry past the cap", () => {
    const stack: UndoEntry[] = [];
    for (let i = 0; i <= UNDO_STACK_LIMIT; i += 1) {
      pushEntry(stack, updateEntry(`issue-${i}`, i * (CATEGORY_COALESCE_MS + 1)));
    }
    expect(stack).toHaveLength(UNDO_STACK_LIMIT);
    expect(
      stack[0].kind === "update" ? stack[0].issueId : null
    ).toBe("issue-1");
  });
});
