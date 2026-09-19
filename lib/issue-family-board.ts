import type { Issue } from "@/lib/types";
import { ALL_STATUSES, type StatusMeta } from "@/lib/issue-constants";

export const ISSUE_FAMILY_PARAM = "family";

type FamilyIssue = Pick<Issue, "id" | "parent_id">;

/**
 * The columns a family board renders: the FULL status sweep. A family keeps
 * its members whatever their status — `triage` (arrival zone) and
 * `duplicate` (closed as a duplicate) included — so every member always
 * finds its column, whatever the board it came from would have hidden.
 */
export function familyBoardStatuses(): StatusMeta[] {
  return ALL_STATUSES;
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
  params.set(ISSUE_FAMILY_PARAM, parentId);
  return `/projects/${encodeURIComponent(projectId)}?${params.toString()}`;
}

/** Remove only the family scope so the current board view remains selected. */
export function issueFamilyBoardExitHref(
  projectId: string,
  search: string | URLSearchParams,
): string {
  const params = boardParams(search);
  params.delete(ISSUE_FAMILY_PARAM);
  const query = params.toString();
  const pathname = `/projects/${encodeURIComponent(projectId)}`;
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
