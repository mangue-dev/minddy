import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import type { Collaborator } from "@/lib/types";

/**
 * The people a user already works with (MIN-689): whoever has JOINED one of
 * the projects this user belongs to — its owner, a member or a reader.
 *
 * Joined, not invited: a pending invitation proves only that someone typed an
 * address, so it never makes its recipient a collaborator. The account must
 * also have a verified email, since inviting a collaborator resolves their
 * address on the server instead of asking for it.
 *
 * This list lets the project wizard propose people by name. It reveals
 * nothing new: members of a shared project already see each other's name,
 * email and avatar in that project's member list.
 */

type ProjectRow = { id: string; owner_id: string; deleted_at: string | null };
type MembershipRow = { project_id: string; user_id: string };

/** The live projects `actorId` has joined, as owner, member or reader. */
async function joinedProjects(service: SupabaseClient, actorId: string): Promise<ProjectRow[]> {
  const [owned, joined] = await Promise.all([
    service.from("projects").select("id, owner_id, deleted_at").eq("owner_id", actorId).is("deleted_at", null),
    service.from("project_members").select("project_id, user_id").eq("user_id", actorId),
  ]);
  if (owned.error || joined.error) throw new Error("Unable to read the user's projects");

  const joinedIds = ((joined.data ?? []) as MembershipRow[]).map((row) => row.project_id);
  const others = joinedIds.length === 0
    ? { data: [] as ProjectRow[], error: null }
    : await service.from("projects").select("id, owner_id, deleted_at").in("id", joinedIds).is("deleted_at", null);
  if (others.error) throw new Error("Unable to read the user's projects");
  return [...((owned.data ?? []) as ProjectRow[]), ...((others.data ?? []) as ProjectRow[])];
}

/** The ids of everyone who has joined a live project that `actorId` also joined. */
async function collaboratorIds(service: SupabaseClient, actorId: string): Promise<string[]> {
  const projects = await joinedProjects(service, actorId);
  if (projects.length === 0) return [];
  const members = await service.from("project_members").select("project_id, user_id")
    .in("project_id", projects.map((project) => project.id));
  if (members.error) throw new Error("Unable to read project members");

  const ids = new Set<string>([
    ...projects.map((project) => project.owner_id),
    ...((members.data ?? []) as MembershipRow[]).map((row) => row.user_id),
  ]);
  ids.delete(actorId);
  return [...ids];
}

/** Whether `userId` has joined a live project that `actorId` also joined. */
async function sharesAJoinedProject(service: SupabaseClient, actorId: string, userId: string): Promise<boolean> {
  const projects = await joinedProjects(service, actorId);
  if (projects.some((project) => project.owner_id === userId)) return true;
  if (projects.length === 0) return false;
  const { data, error } = await service.from("project_members").select("project_id")
    .eq("user_id", userId).in("project_id", projects.map((project) => project.id)).limit(1);
  if (error) throw new Error("Unable to read project members");
  return (data ?? []).length > 0;
}

/** Everyone `actorId` already works with, verified accounts only, sorted by name. */
export async function listCollaborators(service: SupabaseClient, actorId: string): Promise<Collaborator[]> {
  const ids = await collaboratorIds(service, actorId);
  if (ids.length === 0) return [];
  const [users, seeds] = await Promise.all([fetchAuthUsersById(service, ids), fetchAvatarSeeds(service, ids)]);
  const collaborators: Collaborator[] = [];
  for (const id of ids) {
    const user = users.get(id);
    if (!user?.email || !user.email_confirmed_at) continue;
    collaborators.push({ user_id: id, ...toNamed(user), email: user.email.toLowerCase(), avatar_seed: seeds.get(id) ?? id });
  }
  return collaborators.sort((a, b) =>
    (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email) || a.user_id.localeCompare(b.user_id));
}

/**
 * The account and verified email of `userId` when they are one of `actorId`'s
 * collaborators, `null` otherwise. Inviting by account goes through here, so
 * an arbitrary user id never resolves to an address.
 */
export async function resolveCollaborator(
  service: SupabaseClient,
  actorId: string,
  userId: string,
): Promise<{ id: string; email: string } | null> {
  if (userId === actorId) return null;
  if (!(await sharesAJoinedProject(service, actorId, userId))) return null;
  const user = (await fetchAuthUsersById(service, [userId])).get(userId);
  if (!user?.email || !user.email_confirmed_at) return null;
  return { id: user.id, email: user.email.trim().toLowerCase() };
}
