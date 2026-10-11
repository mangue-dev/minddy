import type { DatabaseProperty, DatabaseValue } from "@/lib/page-databases";

export const ROUTINE_EVENTS = ["issue.created", "issue.status_changed", "issue.assigned", "issue.comment_added", "feedback.received"] as const;
export type RoutineEvent = typeof ROUTINE_EVENTS[number];
export type ConditionOperator = "eq" | "neq" | "in" | "contains" | "present" | "absent" | "gt" | "gte" | "lt" | "lte";
export type RoutineCondition =
  | { operator: "and" | "or"; children: RoutineCondition[] }
  | { field: "status" | "assignee" | "category" | "priority" | "effort" | "property"; propertyId?: string; operator: ConditionOperator; value?: DatabaseValue };
export type RoutineTrigger =
  | { type: "schedule" }
  | { type: "event"; event: RoutineEvent; status?: string; assigneeId?: string; issueId?: string; conditions?: RoutineCondition; delayMinutes?: number }
  | { type: "database"; databaseId: string; conditions?: RoutineCondition; delayMinutes?: number };
export interface ConditionContext {
  status?: string | null;
  assignee?: string | null;
  category?: string[];
  priority?: string | null;
  effort?: string | null;
  properties?: Record<string, DatabaseValue>;
  schema?: DatabaseProperty[];
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["triage", "backlog", "todo", "in_progress", "in_review", "done", "canceled", "duplicate"];
const OPERATORS = ["eq", "neq", "in", "contains", "present", "absent", "gt", "gte", "lt", "lte"];
export class RoutineTriggerError extends Error {
  constructor(public code: string) { super(code); }
}
function refuse(code = "invalidTrigger"): never { throw new RoutineTriggerError(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return refuse();
  return value as Record<string, unknown>;
}
function keys(row: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(row).some(key => !allowed.includes(key))) refuse();
}
/** Bound the complete tree before recursion; never evaluate executable expressions. */
export function parseRoutineTrigger(value: unknown): RoutineTrigger {
  if (value === undefined) return { type: "schedule" };
  if (JSON.stringify(value).length > 16_384) refuse("conditionTooLarge");
  const row = object(value);
  if (row.type === "schedule") { keys(row, ["type"]); return { type: "schedule" }; }
  if (row.type !== "event" && row.type !== "database") refuse();
  keys(row, row.type === "event" ? ["type", "event", "status", "assigneeId", "issueId", "conditions", "delayMinutes"] : ["type", "databaseId", "conditions", "delayMinutes"]);
  if (row.delayMinutes !== undefined && (typeof row.delayMinutes !== "number" || !Number.isInteger(row.delayMinutes) || row.delayMinutes < 0 || row.delayMinutes > 120)) refuse();
  if (row.type === "database" && (typeof row.databaseId !== "string" || !UUID.test(row.databaseId))) refuse();
  if (row.type === "event") {
    if (!ROUTINE_EVENTS.includes(row.event as RoutineEvent)) refuse();
    if (row.event === "issue.status_changed") {
      if (!STATUSES.includes(row.status as string)) refuse();
    } else if (row.status !== undefined) refuse();
    if (row.event === "issue.comment_added") {
      if (typeof row.issueId !== "string" || !UUID.test(row.issueId)) refuse();
    } else if (row.issueId !== undefined) refuse();
    if (row.assigneeId !== undefined && (row.event !== "issue.assigned" || typeof row.assigneeId !== "string" || !UUID.test(row.assigneeId))) refuse();
  }
  let count = 0;
  function condition(value: unknown, depth = 0): RoutineCondition {
    if (++count > 64 || depth > 6) refuse("conditionTooLarge");
    const node = object(value);
    if (node.operator === "and" || node.operator === "or") {
      keys(node, ["operator", "children"]);
      if (!Array.isArray(node.children) || !node.children.length || node.children.length > 16) refuse();
      return { operator: node.operator, children: node.children.map(child => condition(child, depth + 1)) };
    }
    keys(node, ["field", "propertyId", "operator", "value"]);
    if (!OPERATORS.includes(node.operator as string)) refuse();
    if (row.type === "database" ? node.field !== "property" : !["status", "assignee", "category", "priority", "effort"].includes(node.field as string)) refuse();
    if (row.type === "event" && row.event === "feedback.received") refuse();
    if (node.field === "property") {
      if (typeof node.propertyId !== "string" || !UUID.test(node.propertyId)) refuse();
    } else if (node.propertyId !== undefined) refuse();
    if (node.operator === "present" || node.operator === "absent") {
      if (node.value !== undefined) refuse();
    } else {
      if (node.value === undefined || node.value === null) refuse();
      if (node.operator === "in") {
        if (!Array.isArray(node.value) || !node.value.length || node.value.length > 100 || !node.value.every(v => typeof v === "string")) refuse();
      } else if (!["string", "number", "boolean"].includes(typeof node.value)) refuse();
      if (typeof node.value === "number" && !Number.isFinite(node.value)) refuse();
      if (node.field !== "property") {
        if (!["eq", "neq", "in", "contains"].includes(node.operator as string)) refuse();
        if (node.field === "category" ? !["contains", "present", "absent"].includes(node.operator as string) : node.operator === "contains") refuse();
        const values = Array.isArray(node.value) ? node.value : [node.value];
        const allowed = node.field === "status" ? STATUSES : node.field === "priority" ? ["none", "low", "medium", "high", "urgent"] : node.field === "effort" ? ["xs", "s", "m", "l", "xl"] : null;
        if (!values.every(v => typeof v === "string" && (allowed ? allowed.includes(v) : UUID.test(v)))) refuse();
      }
    }
    return node as unknown as RoutineCondition;
  }
  return { ...row, ...(row.conditions !== undefined ? { conditions: condition(row.conditions) } : {}) } as RoutineTrigger;
}
export function conditionLeaves(tree?: RoutineCondition): Extract<RoutineCondition, { field: string }>[] {
  if (!tree) return [];
  return "children" in tree ? tree.children.flatMap(conditionLeaves) : [tree];
}
/** Schema validation also runs when an armed entry is reevaluated after a schema edit. */
export function assertPropertyConditions(trigger: RoutineTrigger, schema: DatabaseProperty[]) {
  if (trigger.type !== "database") return;
  for (const leaf of conditionLeaves(trigger.conditions)) {
    const property = schema.find(p => p.id === leaf.propertyId);
    if (!property) refuse("invalidConditionReference");
    if (["present", "absent"].includes(leaf.operator)) continue;
    const collection = ["people", "multi_select"].includes(property.type);
    if (collection && leaf.operator !== "contains" || !collection && leaf.operator === "contains") refuse("invalidConditionOperator");
    const comparative = ["gt", "gte", "lt", "lte"].includes(leaf.operator);
    if (comparative && !["number", "date", "created_at"].includes(property.type)) refuse("invalidConditionOperator");
    if (property.type === "number" ? typeof leaf.value !== "number" : property.type === "checkbox" ? typeof leaf.value !== "boolean" : !(typeof leaf.value === "string" || leaf.operator === "in")) refuse("invalidConditionValue");
    const values = Array.isArray(leaf.value) ? leaf.value : [leaf.value];
    if (["select", "multi_select"].includes(property.type) && values.some(v => !property.options?.some(o => o.id === v))) refuse("invalidConditionReference");
    if (property.type === "people" && values.some(v => typeof v !== "string" || !UUID.test(v))) refuse("invalidConditionReference");
    if (["date", "created_at"].includes(property.type) && values.some(v => typeof v !== "string" || !Number.isFinite(Date.parse(v)))) refuse("invalidConditionValue");
  }
}
export function evaluateRoutineConditions(tree: RoutineCondition | undefined, context: ConditionContext): boolean {
  if (!tree) return true;
  if ("children" in tree) return tree.operator === "and" ? tree.children.every(n => evaluateRoutineConditions(n, context)) : tree.children.some(n => evaluateRoutineConditions(n, context));
  let actual = tree.field === "property" ? context.properties?.[tree.propertyId!] : context[tree.field];
  const present = actual != null && actual !== "" && (!Array.isArray(actual) || actual.length > 0);
  if (tree.operator === "present") return present;
  if (tree.operator === "absent") return !present;
  if (!present) return false;
  let expected = tree.value;
  const property = context.schema?.find(p => p.id === tree.propertyId);
  if (property && ["date", "created_at"].includes(property.type) && ["gt", "gte", "lt", "lte", "eq", "neq"].includes(tree.operator)) {
    actual = typeof actual === "string" ? Date.parse(actual) : NaN;
    expected = typeof expected === "string" ? Date.parse(expected) : NaN;
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  }
  switch (tree.operator) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "in": return Array.isArray(tree.value) && tree.value.includes(actual as string);
    case "contains": return Array.isArray(actual) && actual.includes(tree.value as string);
    case "gt": return actual! > expected!;
    case "gte": return actual! >= expected!;
    case "lt": return actual! < expected!;
    case "lte": return actual! <= expected!;
  }
}

/** Remap only references; trigger values remain typed and arbitrary code is refused. */
export function remapRoutineTrigger(value: unknown, refs: {
  pages: Map<string, string>; issues: Map<string, string>; categories: Map<string, string>;
  sourceUserId: string; targetUserId: string; databaseSchema?: DatabaseProperty[];
}): RoutineTrigger {
  const trigger = parseRoutineTrigger(value);
  if (trigger.type === "schedule") return trigger;
  const mapped = (id: string, map: Map<string, string>) => {
    return map.get(id) ?? id;
  };
  const user = (id: string) => id === refs.sourceUserId ? refs.targetUserId : id;
  const visit = (node: RoutineCondition): RoutineCondition => {
    if ("children" in node) return { ...node, children: node.children.map(visit) };
    const mapValue = (v: string) => node.field === "assignee" || node.field === "property" && refs.databaseSchema?.some(p => p.id === node.propertyId && p.type === "people") ? user(v) : node.field === "category" ? mapped(v, refs.categories) : v;
    return { ...node, value: Array.isArray(node.value) ? node.value.map(mapValue) : typeof node.value === "string" ? mapValue(node.value) : node.value };
  };
  return { ...trigger,
    ...(trigger.type === "database" ? { databaseId: mapped(trigger.databaseId, refs.pages) } : {}),
    ...(trigger.type === "event" && trigger.issueId ? { issueId: mapped(trigger.issueId, refs.issues) } : {}),
    ...(trigger.type === "event" && trigger.assigneeId ? { assigneeId: user(trigger.assigneeId) } : {}),
    ...(trigger.conditions ? { conditions: visit(trigger.conditions) } : {}) };
}
