import { projectPath, recordRef } from "./app-urls";
import type { Issue } from "@/lib/types";
import type { IssueStatus, StatusMeta } from "@/lib/issue-constants";
import { statusColumns } from "@/lib/view-filter";

export const ISSUE_FAMILY_PARAM = "family";

type FamilyIssue = Pick<Issue, "id" | "parent_id">;

/**
 * The columns a family board renders: the same kanban sweep as every other
 * board — the objective page included — WITHOUT `triage` and `duplicate`.
 * A member parked in one of those two statuses reads as unsorted/closed
 * work, not as a column of its own; it stays on the full board, where its
 * column exists. Like every board, it shows the open statuses unless the
 * status filter selects others (MIN-736).
 */
export function familyBoardStatuses(
  status?: readonly IssueStatus[] | null
): StatusMeta[] {
  return statusColumns(status);
}

function boardParams(search: string | URLSearchParams): URLSearchParams {
  return new URLSearchParams(
    typeof search === "string" ? search.replace(/^\?/, "") : search,
  );
}

/** Build a project-board URL scoped to one parent and its direct children. */
export function issueFamilyBoardHref(
  projectId: string,
  parentId: string,
  search: string | URLSearchParams = "",
): string {
  const params = boardParams(search);
  // A family and an objective are mutually exclusive board scopes. One-shot
  // panel/dialog instructions must not be replayed when this URL is shared.
  params.delete("objective");
  params.delete("issue");
  params.delete("new");
  params.delete("setup");
  params.set(ISSUE_FAMILY_PARAM, recordRef(parentId));
  return `${projectPath(projectId)}?${params.toString()}`;
}

/** Remove only the family scope so the current board view remains selected. */
export function issueFamilyBoardExitHref(
  projectId: string,
  search: string | URLSearchParams,
): string {
  const params = boardParams(search);
  params.delete(ISSUE_FAMILY_PARAM);
  const query = params.toString();
  const pathname = projectPath(projectId);
  return query ? `${pathname}?${query}` : pathname;
}

/** Resolve the requested family, keeping the parent first and direct children only. */
export function resolveIssueFamily<T extends FamilyIssue>(
  issues: T[],
  parentId: string | null,
): { parent: T; issues: T[] } | null {
  if (!parentId) return null;
  const parent = issues.find((issue) => issue.id === parentId);
  if (!parent) return null;
  return {
    parent,
    issues: [
      parent,
      ...issues.filter((issue) => issue.parent_id === parentId),
    ],
  };
}

/** Parent ids that should expose the family-board context-menu action. */
export function issueParentIds(issues: FamilyIssue[]): Set<string> {
  return new Set(
    issues
      .map((issue) => issue.parent_id)
      .filter((id): id is string => id !== null),
  );
}

/** Parent id that owns an issue's family board, whether the clicked issue is
 * the parent itself or one of its direct children. */
export function issueFamilyParentId(
  issue: FamilyIssue,
  parentIds: ReadonlySet<string>,
): string | null {
  if (parentIds.has(issue.id)) return issue.id;
  return issue.parent_id;
}
