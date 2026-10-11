import { describe, expect, it } from "vitest";
import { routineEditorGroup } from "./routine-editor-conditions";
import { evaluateRoutineConditions, type RoutineCondition } from "./routine-triggers";

const priority = { field: "priority", operator: "eq", value: "high" } as const;
const assignee = { field: "assignee", operator: "present" } as const;

describe("single-group routine editor compatibility", () => {
  it("wraps a saved leaf without losing its typed value", () => {
    const condition = { field: "property", propertyId: "score", operator: "gte", value: 0 } as const;
    expect(routineEditorGroup(condition)).toEqual({ operator: "and", children: [condition] });
  });

  it.each(["and", "or"] as const)("flattens matching %s groups without changing their meaning", operator => {
    const saved: RoutineCondition = { operator, children: [priority, { operator, children: [assignee] }] };
    const flat = routineEditorGroup(saved);
    expect(flat).toEqual({ operator, children: [priority, assignee] });
    for (const context of [{}, { priority: "high" }, { assignee: "person" }, { priority: "high", assignee: "person" }]) {
      expect(evaluateRoutineConditions(flat!, context)).toBe(evaluateRoutineConditions(saved, context));
    }
  });

  it("removes redundant single-child wrappers around a different group rule", () => {
    expect(routineEditorGroup({ operator: "or", children: [{ operator: "and", children: [priority, assignee] }] })).toEqual({ operator: "and", children: [priority, assignee] });
  });

  it("preserves mixed nested logic for explicit replacement", () => {
    const saved: RoutineCondition = { operator: "and", children: [priority, { operator: "or", children: [assignee, { field: "effort", operator: "eq", value: "s" }] }] };
    const before = structuredClone(saved);
    expect(routineEditorGroup(saved)).toBeNull();
    expect(saved).toEqual(before);
  });

  it("does not expose an equivalent group beyond the editor's sixteen-condition limit", () => {
    expect(routineEditorGroup({ operator: "and", children: [{ operator: "and", children: Array(16).fill(priority) }, assignee] })).toBeNull();
  });
});
