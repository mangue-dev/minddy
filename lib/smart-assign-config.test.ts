import { describe, expect, it } from "vitest";
import {
  isSmartAssignBackfillStatus,
  parseSmartAssignFromStatus,
  smartAssignFillsEmptyAssignee,
  smartAssignFromStatusOf,
  smartAssignReaches,
} from "./smart-assign-config";

const ENABLED_AT = "2026-11-01T10:00:00.000Z";
const BEFORE = "2026-10-01T10:00:00.000Z";
const AFTER = "2026-11-02T10:00:00.000Z";

const on = { smart_assign_enabled: true, smart_assign_enabled_at: ENABLED_AT };
const filling = { ...on, smart_assign_backfill_requested_at: AFTER };
const empty = (status: string, createdAt: string | null | undefined) => ({
  status,
  assigneeId: null,
  createdAt,
});

describe("smartAssignFillsEmptyAssignee", () => {
  it("keeps Unassigned when the toggle is off or unknown", () => {
    expect(smartAssignFillsEmptyAssignee({ smart_assign_enabled: false }, empty("todo", AFTER))).toBe(false);
    expect(smartAssignFillsEmptyAssignee(undefined, empty("todo", AFTER))).toBe(false);
  });

  it("keeps Unassigned for issues Smart Assign never assigns", () => {
    expect(smartAssignFillsEmptyAssignee(filling, empty("canceled", AFTER))).toBe(false);
    expect(smartAssignFillsEmptyAssignee(filling, empty("duplicate", AFTER))).toBe(false);
  });

  it("names Smart Assign for an issue in triage, whatever its age", () => {
    expect(smartAssignFillsEmptyAssignee(on, empty("triage", BEFORE))).toBe(true);
  });

  it("names Smart Assign for an open issue created after it was turned on", () => {
    expect(smartAssignFillsEmptyAssignee(on, empty("todo", AFTER))).toBe(true);
    expect(smartAssignFillsEmptyAssignee(on, empty("in_progress", AFTER))).toBe(true);
  });

  it("keeps Unassigned for an empty issue that was open before it was turned on (MIN-903)", () => {
    expect(smartAssignFillsEmptyAssignee(on, empty("backlog", BEFORE))).toBe(false);
    expect(smartAssignFillsEmptyAssignee(on, empty("todo", BEFORE))).toBe(false);
    expect(smartAssignFillsEmptyAssignee(on, empty("done", BEFORE))).toBe(false);
  });

  it("does not assume an issue is recent when its age or the activation date is unknown", () => {
    expect(smartAssignFillsEmptyAssignee(on, empty("todo", undefined))).toBe(false);
    expect(
      smartAssignFillsEmptyAssignee({ smart_assign_enabled: true }, empty("todo", AFTER))
    ).toBe(false);
  });

  it("names Smart Assign on the issues a running backfill will fill, and only those", () => {
    expect(smartAssignFillsEmptyAssignee(filling, empty("backlog", BEFORE))).toBe(true);
    expect(smartAssignFillsEmptyAssignee(filling, empty("todo", BEFORE))).toBe(true);
    expect(smartAssignFillsEmptyAssignee(filling, empty("in_progress", BEFORE))).toBe(false);
    expect(smartAssignFillsEmptyAssignee(filling, empty("done", BEFORE))).toBe(false);
  });

  it("names Smart Assign as the empty option when emptying the field makes it choose", () => {
    // An issue that has an assignee: clearing it triggers Smart Assign.
    expect(
      smartAssignFillsEmptyAssignee(on, { status: "done", assigneeId: "user-1", createdAt: BEFORE })
    ).toBe(true);
    // The creation form: the issue is assigned when it is created.
    expect(smartAssignFillsEmptyAssignee(on, empty("backlog", null))).toBe(true);
  });
});

describe("smartAssignFillsEmptyAssignee — assign from todo (MIN-957)", () => {
  const fromTodo = { ...on, smart_assign_from_status: "todo" };

  it("keeps Unassigned below the start status, whatever the issue", () => {
    // Not assigned yet: triage and backlog, even for a recent issue.
    expect(smartAssignFillsEmptyAssignee(fromTodo, empty("triage", AFTER))).toBe(false);
    expect(smartAssignFillsEmptyAssignee(fromTodo, empty("backlog", AFTER))).toBe(false);
    // The creation form on a backlog issue, and clearing an assignee there.
    expect(smartAssignFillsEmptyAssignee(fromTodo, empty("backlog", null))).toBe(false);
    expect(
      smartAssignFillsEmptyAssignee(fromTodo, {
        status: "backlog",
        assigneeId: "user-1",
        createdAt: AFTER,
      })
    ).toBe(false);
  });

  it("names Smart Assign from the start status on", () => {
    expect(smartAssignFillsEmptyAssignee(fromTodo, empty("todo", null))).toBe(true);
    expect(smartAssignFillsEmptyAssignee(fromTodo, empty("todo", AFTER))).toBe(true);
    expect(smartAssignFillsEmptyAssignee(fromTodo, empty("in_progress", AFTER))).toBe(true);
    expect(smartAssignFillsEmptyAssignee(fromTodo, empty("todo", BEFORE))).toBe(false);
  });

  it("limits a running backfill to todo", () => {
    const fillingFromTodo = { ...filling, smart_assign_from_status: "todo" };
    expect(smartAssignFillsEmptyAssignee(fillingFromTodo, empty("todo", BEFORE))).toBe(true);
    expect(smartAssignFillsEmptyAssignee(fillingFromTodo, empty("backlog", BEFORE))).toBe(false);
  });
});

describe("the start status", () => {
  it("accepts backlog and todo only", () => {
    expect(parseSmartAssignFromStatus("backlog")).toBe("backlog");
    expect(parseSmartAssignFromStatus("todo")).toBe("todo");
    expect(parseSmartAssignFromStatus("in_progress")).toBeNull();
    expect(parseSmartAssignFromStatus(undefined)).toBeNull();
  });

  it("reads backlog from a project that has no setting or an unknown one", () => {
    expect(smartAssignFromStatusOf(undefined)).toBe("backlog");
    expect(smartAssignFromStatusOf({})).toBe("backlog");
    expect(smartAssignFromStatusOf({ smart_assign_from_status: "in_review" })).toBe("backlog");
    expect(smartAssignFromStatusOf({ smart_assign_from_status: "todo" })).toBe("todo");
  });

  it("is reached by its own status and the later ones, never by triage or a closed issue", () => {
    const reached = (from: "backlog" | "todo") =>
      ["triage", "backlog", "todo", "in_progress", "in_review", "done", "canceled", "duplicate"]
        .filter((status) => smartAssignReaches(from, status));
    expect(reached("backlog")).toEqual(["backlog", "todo", "in_progress", "in_review", "done"]);
    expect(reached("todo")).toEqual(["todo", "in_progress", "in_review", "done"]);
  });
});

describe("isSmartAssignBackfillStatus", () => {
  it("accepts backlog and todo, and nothing else", () => {
    expect(["backlog", "todo"].every((status) => isSmartAssignBackfillStatus(status))).toBe(true);
    expect(
      ["triage", "in_progress", "in_review", "done", "canceled", "duplicate", null].some(
        (status) => isSmartAssignBackfillStatus(status)
      )
    ).toBe(false);
  });

  it("stops at todo when the project assigns from todo", () => {
    expect(isSmartAssignBackfillStatus("todo", "todo")).toBe(true);
    expect(isSmartAssignBackfillStatus("backlog", "todo")).toBe(false);
  });
});
