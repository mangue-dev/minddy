import type { RoutineCondition } from "@/lib/routine-triggers";

export type RoutineEditorCondition = Extract<RoutineCondition, { field: string }>;
export type RoutineEditorGroup = {
  operator: "and" | "or";
  children: RoutineEditorCondition[];
};

/** Present equivalent conditions as one group without changing saved semantics. */
export function routineEditorGroup(value: RoutineCondition): RoutineEditorGroup | null {
  let effective = value;
  while ("children" in effective && effective.children.length === 1) effective = effective.children[0];
  const operator = "children" in effective ? effective.operator : "and";
  function collect(node: RoutineCondition): RoutineEditorCondition[] | null {
    if (!("children" in node)) return [node];
    if (node.children.length === 1) return collect(node.children[0]);
    if (node.operator !== operator) return null;
    const children: RoutineEditorCondition[] = [];
    for (const child of node.children) {
      const leaves = collect(child);
      if (!leaves) return null;
      children.push(...leaves);
    }
    return children;
  }
  const children = collect(effective);
  return children?.length && children.length <= 16 ? { operator, children } : null;
}
