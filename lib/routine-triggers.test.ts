import { describe, expect, it } from "vitest";
import { assertPropertyConditions, evaluateRoutineConditions, parseRoutineTrigger, remapRoutineTrigger, type RoutineCondition } from "./routine-triggers";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
describe("routine trigger and condition contract", () => {
  it("preserves legacy schedules and requires an explicit target for status/comment/database events", () => {
    expect(parseRoutineTrigger(undefined)).toEqual({ type: "schedule" });
    for (const trigger of [{ type: "event", event: "issue.status_changed" }, { type: "event", event: "issue.comment_added" }, { type: "database" }, { type: "schedule", conditions: {} }]) expect(() => parseRoutineTrigger(trigger)).toThrow();
    expect(parseRoutineTrigger({ type: "event", event: "issue.status_changed", status: "triage" })).toHaveProperty("status", "triage");
  });
  it("waits for categories and assignment added after triage, with nested AND/OR", () => {
    const tree: RoutineCondition = { operator: "and", children: [{ field: "status", operator: "eq", value: "triage" }, { operator: "or", children: [{ field: "category", operator: "contains", value: id }, { field: "category", operator: "contains", value: other }] }, { field: "assignee", operator: "eq", value: id }] };
    const trigger = parseRoutineTrigger({ type: "event", event: "issue.status_changed", status: "triage", conditions: tree });
    expect(trigger.type).toBe("event");
    expect(evaluateRoutineConditions(tree, { status: "triage", category: [] })).toBe(false);
    expect(evaluateRoutineConditions(tree, { status: "triage", category: [other] })).toBe(false);
    expect(evaluateRoutineConditions(tree, { status: "triage", category: [other], assignee: id })).toBe(true);
  });
  it("bounds depth, fan-out, total nodes and serialized size", () => {
    let tree: RoutineCondition = { field: "priority", operator: "eq", value: "high" };
    for (let i = 0; i < 8; i++) tree = { operator: "and", children: [tree] };
    expect(() => parseRoutineTrigger({ type: "event", event: "issue.created", conditions: tree })).toThrow("conditionTooLarge");
    expect(() => parseRoutineTrigger({ type: "database", databaseId: id, conditions: { field: "property", propertyId: id, operator: "eq", value: "x".repeat(17000) } })).toThrow("conditionTooLarge");
    expect(() => parseRoutineTrigger({ type: "event", event: "issue.created", conditions: { operator: "and", children: Array(17).fill({ field: "priority", operator: "eq", value: "high" }) } })).toThrow();
  });
  it("rejects executable expressions and invalid typed comparisons", () => {
    for (const conditions of [{ field: "status", operator: "gt", value: "done" }, { field: "priority", operator: "eq", value: 7 }, { field: "category", operator: "eq", value: id }, { field: "assignee", operator: "eq", value: "foreign-id" }, { expression: "eval('true')" }, { field: "priority", operator: "eq", value: "high", code: "true" }]) expect(() => parseRoutineTrigger({ type: "event", event: "issue.created", conditions })).toThrow();
  });
  it("validates property types, stable option IDs, and removed schema references", () => {
    const trigger = parseRoutineTrigger({ type: "database", databaseId: id, conditions: { field: "property", propertyId: other, operator: "gte", value: 2 } });
    expect(() => assertPropertyConditions(trigger, [{ id: other, name: "Score", type: "number" }])).not.toThrow();
    expect(() => assertPropertyConditions(trigger, [{ id: other, name: "Score", type: "text" }])).toThrow();
    expect(() => assertPropertyConditions(trigger, [])).toThrow("invalidConditionReference");
    const tree = { field: "property", propertyId: other, operator: "gte", value: 2 } as const;
    expect(evaluateRoutineConditions(tree, { properties: {} })).toBe(false);
    expect(evaluateRoutineConditions(tree, { properties: { [other]: 2 } })).toBe(true);
  });
  it("treats false and zero as filled and does not satisfy inequality on missing data", () => {
    expect(evaluateRoutineConditions({ field: "property", propertyId: id, operator: "present" }, { properties: { [id]: false } })).toBe(true);
    expect(evaluateRoutineConditions({ field: "property", propertyId: id, operator: "present" }, { properties: { [id]: 0 } })).toBe(true);
    expect(evaluateRoutineConditions({ field: "effort", operator: "neq", value: "xl" }, {})).toBe(false);
  });
});


describe("trigger transfer and date comparisons", () => {
  it("compares timestamps as instants across offsets and refuses invalid source values", () => {
    const condition = { field: "property", propertyId: id, operator: "gte", value: "2026-10-11T10:00:00Z" } as const;
    const schema = [{ id, name: "Created", type: "created_at" as const }];
    expect(evaluateRoutineConditions(condition, { schema, properties: { [id]: "2026-10-11T11:00:00+02:00" } })).toBe(false);
    expect(evaluateRoutineConditions(condition, { schema, properties: { [id]: "2026-10-11T12:00:00+02:00" } })).toBe(true);
    expect(evaluateRoutineConditions(condition, { schema, properties: { [id]: "unavailable" } })).toBe(false);
  });
  it("remaps people references without rewriting text or stable property identifiers", () => {
    const trigger = remapRoutineTrigger({ type: "database", databaseId: id, conditions: { operator: "and", children: [{ field: "property", propertyId: id, operator: "contains", value: id }, { field: "property", propertyId: other, operator: "eq", value: id }] } }, { pages: new Map([[id, other]]), issues: new Map(), categories: new Map(), sourceUserId: id, targetUserId: other, databaseSchema: [{ id, name: "Reviewer", type: "people" }, { id: other, name: "Text", type: "text" }] });
    expect(trigger).toMatchObject({ databaseId: other, conditions: { children: [{ propertyId: id, value: other }, { propertyId: other, value: id }] } });
  });
});
