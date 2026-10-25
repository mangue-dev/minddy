import { describe, expect, it } from "vitest";
import {
  allTargetsHaveCategory,
  allTargetsMatch,
  hasDirectRelation,
  sharedValue,
  shortcutTargets,
  toggleCategoryAcross,
} from "./issue-shortcut-targets";
import type { DisplayRelation } from "./relation-constants";
import type { Issue } from "./types";

function issue(id: string, over: Partial<Issue> = {}): Issue {
  return {
    id,
    project_id: "p1",
    priority: "none",
    effort: null,
    due_date: null,
    category_ids: [],
    ...over,
  } as Issue;
}

const ids = (issues: Issue[]) => issues.map((i) => i.id);

describe("shortcutTargets", () => {
  const a = issue("a");
  const b = issue("b");
  const c = issue("c", { project_id: "p2" });

  it("edits the hovered card alone when it is outside the selection", () => {
    expect(ids(shortcutTargets(a, [b, c], "priority"))).toEqual(["a"]);
    expect(ids(shortcutTargets(a, [], "priority"))).toEqual(["a"]);
  });

  it("edits the whole selection, anchor first, when the card belongs to it", () => {
    expect(ids(shortcutTargets(b, [a, b, c], "priority"))).toEqual(["b", "a", "c"]);
    expect(ids(shortcutTargets(a, [a, b, c], "dueDate"))).toEqual(["a", "b", "c"]);
  });

  it.each(["assignee", "objective", "category", "relation"] as const)(
    "keeps %s within the card's project",
    (field) => {
      expect(ids(shortcutTargets(a, [a, b, c], field))).toEqual(["a", "b"]);
      expect(ids(shortcutTargets(c, [a, b, c], field))).toEqual(["c"]);
    },
  );
});

describe("selection values", () => {
  const targets = [issue("a", { priority: "high" }), issue("b", { priority: "high", effort: "m" })];

  it("checks a value only when every target holds it", () => {
    expect(allTargetsMatch(targets, (i) => i.priority, "high")).toBe(true);
    expect(allTargetsMatch(targets, (i) => i.effort, "m")).toBe(false);
    expect(allTargetsMatch(targets, (i) => i.effort, null)).toBe(false);
  });

  it("shows a shared value and nothing when the targets differ", () => {
    expect(sharedValue(targets, (i) => i.priority)).toBe("high");
    expect(sharedValue(targets, (i) => i.effort)).toBeNull();
  });
});

describe("toggleCategoryAcross", () => {
  it("adds the category to the targets that lack it, leaving the others untouched", () => {
    const next = toggleCategoryAcross(
      [issue("a", { category_ids: ["bug"] }), issue("b", { category_ids: ["ui"] })],
      "bug",
    );
    expect(Object.fromEntries(next)).toEqual({ b: ["ui", "bug"] });
  });

  it("removes the category from every target once all of them have it", () => {
    const targets = [
      issue("a", { category_ids: ["bug", "ui"] }),
      issue("b", { category_ids: ["bug"] }),
    ];
    expect(allTargetsHaveCategory(targets, "bug")).toBe(true);
    expect(Object.fromEntries(toggleCategoryAcross(targets, "bug"))).toEqual({
      a: ["ui"],
      b: [],
    });
  });
});

describe("hasDirectRelation", () => {
  const rows = [
    { id: "r1", relation: "blocks", otherId: "x" },
    { id: "r2", relation: "blocks", otherId: "y", inheritedObjectiveId: "o1" },
  ] as DisplayRelation[];

  it("finds a stored edge of the same type and ignores inherited rows", () => {
    expect(hasDirectRelation(rows, "blocks", "x")).toBe(true);
    expect(hasDirectRelation(rows, "related", "x")).toBe(false);
    expect(hasDirectRelation(rows, "blocks", "y")).toBe(false);
    expect(hasDirectRelation(undefined, "blocks", "x")).toBe(false);
  });
});
