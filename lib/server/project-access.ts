import { projectForClient } from "@/lib/server/project-content";
import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeProject } from "@/lib/server/project-content";
import type { Project } from "@/lib/types";
import {
  memberRoleFromRow,
  projectCapabilities,
  type ProjectRole,
} from "@/lib/project-roles";

/**
 * `isMember` means "may read the project" (owner, member or reader). Writes
 * check `canWrite`, comments `canComment`, administration `isOwner`
 * (MIN-693, docs/security/project-roles.md).
 */
export interface ProjectAccess {
  project: Project;
  isOwner: boolean;
  isMember: boolean;
  role: ProjectRole;
  canWrite: boolean;
  canComment: boolean;
}

/** The capability a project operation needs. */
export type ProjectCapability = "read" | "comment" | "write" | "admin";

export function accessAllows(
  access: Pick<ProjectAccess, "isOwner" | "canWrite" | "canComment">,
  capability: ProjectCapability
): boolean {
  switch (capability) {
    case "read":
      return true;
    case "comment":
      return access.canComment;
    case "write":
      return access.canWrite;
    case "admin":
      return access.isOwner;
  }
}

/**
 * Resolve a user's access to a project using the service client (RLS bypassed;
 * the checks live here). Returns null when the project doesn't exist, is deleted,
 * or the user is neither owner nor member — callers turn that into a 404.
 *
 *   isOwner = projects.owner_id === userId
 *   isMember = owner OR a row in project_members  (can_access_project())
 */
/**
 * Among these projects, those to which the user STILL has access (MIN-351).
 *
 * `getProjectAccess` responds for a project and returns the line; this one responds
 * for a batch and only returns ids. This is what a surface needs which
 * rehydrates into a service key a set of lines already written - the inbox - and
 * which must raise the question of access at the time of READING: a
 * notification is a past fact, membership in the project is not.
 *
 * The project trash does not count as a loss of access: it is
 * `getProjectAccess` that removes it, for navigation to a project that is no longer there. Here we just decide what we have the right to reread.
 */
export async function accessibleProjectIds(
  userId: string,
  projectIds: readonly string[]
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const supabase = getServiceClient();

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("id")
      .in("id", projectIds as string[])
      .eq("owner_id", userId),
    supabase
      .from("project_members")
      .select("project_id")
      .in("project_id", projectIds as string[])
      .eq("user_id", userId),
  ]);

  return new Set([
    ...(owned ?? []).map((p) => p.id as string),
    ...(memberships ?? []).map((m) => m.project_id as string),
  ]);
}

/**
 * Among these projects, those where the user may still WRITE (owner or
 * member role). Background work that edits content on a user's behalf (cycle
 * rollover and fill) uses it so a reader's past assignments are never moved.
 */
export async function writableProjectIds(
  userId: string,
  projectIds: readonly string[]
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const supabase = getServiceClient();

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("id")
      .in("id", projectIds as string[])
      .eq("owner_id", userId),
    supabase
      .from("project_members")
      .select("project_id")
      .in("project_id", projectIds as string[])
      .eq("user_id", userId)
      .eq("role", "member"),
  ]);

  return new Set([
    ...(owned ?? []).map((p) => p.id as string),
    ...(memberships ?? []).map((m) => m.project_id as string),
  ]);
}

/**
 * Stamp the viewer's role and comment capability on project rows
 * (`Project.my_role` / `my_can_comment`, MIN-693) so clients can gate their
 * controls. One membership read for the whole list; the owner needs none.
 */
export async function withViewerRoles<Row extends { id: string; owner_id: string }>(
  userId: string,
  projects: readonly Row[]
): Promise<Array<Row & { my_role: ProjectRole; my_can_comment: boolean }>> {
  const memberProjectIds = projects
    .filter((project) => project.owner_id !== userId)
    .map((project) => project.id);
  const memberships = new Map<string, { role: unknown; can_comment: unknown }>();
  if (memberProjectIds.length > 0) {
    const { data, error } = await getServiceClient()
      .from("project_members")
      .select("project_id, role, can_comment")
      .eq("user_id", userId)
      .in("project_id", memberProjectIds);
    if (error) throw new Error("Unable to read project roles");
    for (const row of data ?? []) memberships.set(row.project_id as string, row);
  }
  return projects.map((project) => {
    const membership = memberships.get(project.id);
    const capabilities = project.owner_id === userId
      ? projectCapabilities("owner")
      : projectCapabilities(
          memberRoleFromRow(membership?.role),
          membership?.can_comment === true
        );
    return {
      ...project,
      my_role: capabilities.role,
      my_can_comment: capabilities.canComment,
    };
  });
}

/** Plaintext project columns an access check may return with its decision. */
export type ProjectAccessColumn = "icon_url" | "icon_storage_path";

/**
 * The access decision of `getProjectAccess` without decoding the project, for
 * routes that only need to know whether the caller may use it. The project
 * row and the membership probe are read together in this request; `columns`
 * adds plaintext columns of the same row, read under the same decision.
 */
export async function hasProjectAccess<Column extends ProjectAccessColumn = never>(
  userId: string,
  projectId: string,
  columns: readonly Column[] = []
): Promise<{
  isOwner: boolean;
  role: ProjectRole;
  canWrite: boolean;
  canComment: boolean;
  row: Record<Column, unknown>;
} | null> {
  const supabase = getServiceClient();
  const [{ data: project }, { data: membership }] = await Promise.all([
    supabase
      .from("projects")
      .select(["id", "owner_id", ...columns].join(","))
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("role, can_comment")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!project) return null;
  const row = project as unknown as Record<Column | "owner_id", unknown>;
  const isOwner = row.owner_id === userId;
  if (!isOwner && !membership) return null;
  const capabilities = isOwner
    ? projectCapabilities("owner")
    : projectCapabilities(
        memberRoleFromRow(membership?.role),
        membership?.can_comment === true
      );
  return {
    isOwner,
    role: capabilities.role,
    canWrite: capabilities.canWrite,
    canComment: capabilities.canComment,
    row,
  };
}

export async function getProjectAccess(
  userId: string,
  projectId: string
): Promise<ProjectAccess | null> {
  const supabase = getServiceClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return null;

  const readable = async () =>
    project.encryption_version !== undefined ||
      project.automations !== undefined &&
      project.smart_assign_rules !== undefined
      ? projectForClient(await decodeProject(project, userId)) as unknown as Project
      : projectForClient(project) as Project;

  if (project.owner_id === userId) {
    return {
      project: await readable(),
      isOwner: true,
      isMember: true,
      role: "owner",
      canWrite: true,
      canComment: true,
    };
  }

  const { data: membership } = await supabase
    .from("project_members")
    .select("role, can_comment")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) return null;

  const capabilities = projectCapabilities(
    memberRoleFromRow(membership.role),
    membership.can_comment === true
  );
  return {
    project: await readable(),
    isOwner: false,
    isMember: true,
    role: capabilities.role,
    canWrite: capabilities.canWrite,
    canComment: capabilities.canComment,
  };
}
