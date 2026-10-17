/**
 * Project roles (MIN-693). The owner is `projects.owner_id`; everyone else
 * with access has a `project_members` row whose role is `member` (full
 * content access, the historical behavior) or `reader` (read-only, optionally
 * allowed to comment). The contract lives in docs/security/project-roles.md.
 *
 * Client-safe: the same capability rules gate the UI, while the server stays
 * the authority.
 */

export type ProjectRole = "owner" | "member" | "reader";
export type MemberRole = Exclude<ProjectRole, "owner">;

export const MEMBER_ROLES: readonly MemberRole[] = ["member", "reader"];

export interface ProjectCapabilities {
  role: ProjectRole;
  /** Create, edit, move and delete project content. */
  canWrite: boolean;
  /** Comment on issues, objectives, internal feedback and pages. */
  canComment: boolean;
  /** Settings, members, integrations, routines, ownership. */
  canAdmin: boolean;
}

export function isMemberRole(value: unknown): value is MemberRole {
  return value === "member" || value === "reader";
}

/** Normalize a stored membership role; anything unknown is the narrowest. */
export function memberRoleFromRow(value: unknown): MemberRole {
  return value === "member" ? "member" : "reader";
}

export function projectCapabilities(
  role: ProjectRole,
  readerCanComment = false
): ProjectCapabilities {
  const canWrite = role === "owner" || role === "member";
  return {
    role,
    canWrite,
    canComment: canWrite || (role === "reader" && readerCanComment),
    canAdmin: role === "owner",
  };
}

/** The role is the stored value for members; owners are recognized by id. */
export function resolveProjectRole(
  userId: string | null | undefined,
  ownerId: string,
  memberRole: unknown
): ProjectRole {
  if (userId && userId === ownerId) return "owner";
  return memberRoleFromRow(memberRole);
}
