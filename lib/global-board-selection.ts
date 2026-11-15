import type { Issue, Member } from "./types";

/**
 * The part of a cross-project selection the viewer may edit: project readers
 * (MIN-693) browse their cards on `/all` but never select them, so the bulk
 * actions only ever write to issues the server accepts.
 */
export function writableSelection(
  ids: Iterable<string>,
  issueById: ReadonlyMap<string, Pick<Issue, "project_id">>,
  canWriteIn: (projectId: string) => boolean,
): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const issue = issueById.get(id);
    if (issue && canWriteIn(issue.project_id)) out.add(id);
  }
  return out;
}

/**
 * The assignees a cross-project selection can take: the members of every
 * project it spans, each listed once. Someone outside one of those projects
 * cannot be assigned its issue.
 */
export function sharedMembers(
  selected: ReadonlyArray<Pick<Issue, "project_id">>,
  memberMapByProject: ReadonlyMap<string, ReadonlyMap<string, Member>>,
): Member[] {
  const projectIds = [...new Set(selected.map((issue) => issue.project_id))];
  if (projectIds.length === 0) return [];
  const [first, ...others] = projectIds.map(
    (projectId) => memberMapByProject.get(projectId) ?? new Map<string, Member>(),
  );
  return [...first.values()].filter((member) =>
    others.every((members) => members.has(member.user_id)),
  );
}
