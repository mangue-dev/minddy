// Which tickets a card's field picker writes to (MIN-795).
//
// The S/P/E/A/L/D/O and R pickers of a card (components/issue-field-shortcuts.tsx)
// are anchored on the card under the pointer. When that card belongs to the
// board selection (MIN-75), the picker edits the whole selection; a card
// outside the selection still edits itself alone — the picker shows its
// values, so acting on other tickets from it would be a surprise.
//
// Assignees, objectives, categories and relations belong to a project: the
// picker lists the card's project's members, objectives and categories, which
// mean nothing to a ticket of another project on the cross-project board. Those
// fields reach the selected tickets of the card's project only; status,
// priority, effort and due date reach the whole selection.

import type { DisplayRelation } from "@/lib/relation-constants";
import type { Issue, IssueRelationType } from "@/lib/types";

/** A field picker, or `relation` for the R shortcut. */
export type ShortcutTargetField =
  | "status"
  | "priority"
  | "effort"
  | "dueDate"
  | "assignee"
  | "objective"
  | "category"
  | "relation";

const PROJECT_SCOPED = new Set<ShortcutTargetField>([
  "assignee",
  "objective",
  "category",
  "relation",
]);

/**
 * The tickets a picker opened on `issue` writes to. Always contains `issue`
 * (first) — it is the anchor whatever the selection holds.
 */
export function shortcutTargets(
  issue: Issue,
  selection: readonly Issue[],
  field: ShortcutTargetField,
): Issue[] {
  if (!selection.some((selected) => selected.id === issue.id)) return [issue];
  const scoped = PROJECT_SCOPED.has(field)
    ? selection.filter((selected) => selected.project_id === issue.project_id)
    : selection;
  return [issue, ...scoped.filter((selected) => selected.id !== issue.id)];
}

/** True when every target holds the value — the picker's check mark. */
export function allTargetsMatch<T>(
  targets: readonly Issue[],
  read: (issue: Issue) => T,
  value: T,
): boolean {
  return targets.length > 0 && targets.every((issue) => read(issue) === value);
}

/**
 * The value shared by every target, or `null` when they differ — what a
 * single-value control (the due-date calendar) shows for a selection.
 */
export function sharedValue<T>(
  targets: readonly Issue[],
  read: (issue: Issue) => T,
): T | null {
  if (targets.length === 0) return null;
  const first = read(targets[0]);
  return targets.every((issue) => read(issue) === first) ? first : null;
}

/**
 * Toggling a category across the targets: when every target has it, it leaves
 * all of them; otherwise it joins those that lack it. Returns the new category
 * set of each target that changes, so untouched tickets are not rewritten.
 */
export function toggleCategoryAcross(
  targets: readonly Issue[],
  categoryId: string,
): Map<string, string[]> {
  const remove = allTargetsHaveCategory(targets, categoryId);
  const next = new Map<string, string[]>();
  for (const issue of targets) {
    const has = issue.category_ids.includes(categoryId);
    if (remove) next.set(issue.id, issue.category_ids.filter((id) => id !== categoryId));
    else if (!has) next.set(issue.id, [...issue.category_ids, categoryId]);
  }
  return next;
}

export function allTargetsHaveCategory(
  targets: readonly Issue[],
  categoryId: string,
): boolean {
  return targets.length > 0 && targets.every((issue) => issue.category_ids.includes(categoryId));
}

/**
 * Whether `issueId` already has a direct relation of `type` to `otherId`
 * (inherited objective rows are not edges of their own). Adding the relation
 * to a selection skips those tickets instead of writing a duplicate.
 */
export function hasDirectRelation(
  relations: readonly DisplayRelation[] | undefined,
  type: IssueRelationType,
  otherId: string,
): boolean {
  return (relations ?? []).some(
    (relation) =>
      !relation.inheritedObjectiveId &&
      relation.relation === type &&
      relation.otherId === otherId,
  );
}
