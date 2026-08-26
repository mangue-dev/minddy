import { describe, expect, it } from "vitest";
import { buildBoardColumns, createBoardColumnsBuilder } from "./board-columns";
import type { StatusMeta } from "./issue-constants";
import type { Issue } from "./types";

const statuses = [
  { value: "todo" },
  { value: "in_progress" },
] as StatusMeta[];

function issue(id: string, status: Issue["status"], position: number) {
  return { id, status, position } as Issue;
}

describe("buildBoardColumns", () => {
  it("groups in status order and sorts each populated column", () => {
    const columns = buildBoardColumns(
      statuses,
      [
        issue("doing", "in_progress", 5),
        issue("later", "todo", 20),
        issue("first", "todo", 10),
      ],
      (a, b) => a.position - b.position
    );

    expect(columns.map((column) => column.status.value)).toEqual([
      "todo",
      "in_progress",
    ]);
    expect(columns.map((column) => column.items.map((item) => item.id))).toEqual([
      ["first", "later"],
      ["doing"],
    ]);
  });

  it("does not mutate the source issue order", () => {
    const issues = [issue("later", "todo", 20), issue("first", "todo", 10)];
    buildBoardColumns(statuses, issues, (a, b) => a.position - b.position);
    expect(issues.map((item) => item.id)).toEqual(["later", "first"]);
  });

  it("reuses an unaffected column across issue updates", () => {
    const build = createBoardColumnsBuilder();
    const todo = issue("todo", "todo", 10);
    const doing = issue("doing", "in_progress", 10);
    const first = build(statuses, [todo, doing], (a, b) => a.position - b.position);
    const second = build(
      statuses,
      [{ ...todo, title: "Updated" }, doing],
      (a, b) => a.position - b.position
    );

    expect(second[0]).not.toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });
});
