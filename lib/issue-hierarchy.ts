// Parent and sub-issue links offered next to the relations (MIN-804).
//
// A ticket's relation menus (R on a card, right-click Relations, the side
// panel's relations popover) also set `parent_id`, from either end:
// `parent_of` makes the picked ticket a sub-issue of this one, `sub_issue_of`
// makes this ticket a sub-issue of the picked one. Nothing new is stored: the
// write is an ordinary issue update.
//
// Nesting is one level deep. The `enforce_one_level_subissues` trigger refuses
// anything else; these helpers only offer the moves it accepts, so the menus
// never propose a link that would fail: a sub-issue is not offered as a
// parent, and a ticket with sub-issues is not offered as a sub-issue.
// Re-parenting an existing sub-issue is allowed and replaces its parent.

import type { Issue, IssueRelationType } from "@/lib/types";

export type HierarchyRelation = "parent_of" | "sub_issue_of";

/** What a relation menu entry picks: a stored relation or a hierarchy link. */
export type RelationMenuKind = IssueRelationType | HierarchyRelation;

/** Menu order, after the three stored relation types. */
export const HIERARCHY_RELATIONS: readonly HierarchyRelation[] = [
  "parent_of",
  "sub_issue_of",
];

export const isHierarchyRelation = (value: unknown): value is HierarchyRelation =>
  value === "parent_of" || value === "sub_issue_of";

type HierarchyIssue = Pick<Issue, "id" | "project_id" | "parent_id">;

function parentIds(issues: readonly HierarchyIssue[]): Set<string> {
  const ids = new Set<string>();
  for (const issue of issues) if (issue.parent_id) ids.add(issue.parent_id);
  return ids;
}

/** Sources that may become a sub-issue: those without sub-issues of their own. */
function childEligible(
  sources: readonly HierarchyIssue[],
  withChildren: Set<string>,
): HierarchyIssue[] {
  return sources.filter((source) => !withChildren.has(source.id));
}

/**
 * Whether the menu offers `kind` for these source tickets. `parent_of` needs a
 * single top-level source (one ticket cannot become the sub-issue of several
 * parents at once); `sub_issue_of` needs at least one source without
 * sub-issues.
 */
export function hierarchyAvailable(
  kind: HierarchyRelation,
  sources: readonly HierarchyIssue[],
  allIssues: readonly HierarchyIssue[],
): boolean {
  if (kind === "parent_of") return sources.length === 1 && !sources[0].parent_id;
  return childEligible(sources, parentIds(allIssues)).length > 0;
}

/** The tickets the picker lists as the other end of `kind`. */
export function hierarchyCandidates<T extends HierarchyIssue>(
  kind: HierarchyRelation,
  sources: readonly HierarchyIssue[],
  allIssues: readonly T[],
): T[] {
  if (!hierarchyAvailable(kind, sources, allIssues)) return [];
  const projectId = sources[0].project_id;
  const sourceIds = new Set(sources.map((source) => source.id));
  const withChildren = parentIds(allIssues);
  const sameProject = (issue: T) =>
    issue.project_id === projectId && !sourceIds.has(issue.id);

  if (kind === "parent_of") {
    const parent = sources[0];
    // A future sub-issue has no sub-issues and is not already this one's.
    return allIssues.filter(
      (issue) =>
        sameProject(issue) &&
        !withChildren.has(issue.id) &&
        issue.parent_id !== parent.id,
    );
  }
  const children = childEligible(sources, withChildren);
  // A future parent is top-level and not already the parent of every source.
  return allIssues.filter(
    (issue) =>
      sameProject(issue) &&
      !issue.parent_id &&
      children.some((child) => child.parent_id !== issue.id),
  );
}

/** The `parent_id` writes that apply `kind` between the sources and `targetId`. */
export function hierarchyPatches(
  kind: HierarchyRelation,
  sources: readonly HierarchyIssue[],
  targetId: string,
  allIssues: readonly HierarchyIssue[],
): { issueId: string; parent_id: string }[] {
  if (!hierarchyAvailable(kind, sources, allIssues)) return [];
  if (kind === "parent_of") {
    return [{ issueId: targetId, parent_id: sources[0].id }];
  }
  return childEligible(sources, parentIds(allIssues))
    .filter((child) => child.id !== targetId && child.parent_id !== targetId)
    .map((child) => ({ issueId: child.id, parent_id: targetId }));
}
