import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAuthUsersById, toNamed } from "./auth-users";
import { fetchAvatarSeeds } from "./avatar-seeds";
import type { Member } from "@/lib/types";

/**
 * Members of every project I can access, bucketed by project id.
 *
 * Shared by the cross-project reads that need to *name* people (GET
 * /api/me/board, GET /api/me/search-index). Two clients are required, and the
 * split is the whole point:
 * - `userSupabase` reads `projects`, so RLS (`can_access_project`) decides which
 *   projects are mine — the scope of the result comes from the caller's session,
 *   never from the service role;
 * - `service` reads `project_members` (not readable for *other* users under
 *   RLS) and resolves display names through the auth admin API.
 *
 * The owner has no `project_members` row, so their entry is synthesized from
 * `projects.owner_id` first — mirroring GET /api/projects/[id]/members.
 */
export async function loadMembersByProject(
  service: SupabaseClient,
  userSupabase: SupabaseClient
): Promise<{ members: Record<string, Member[]>; projectIds: string[] }> {
  const { data: projectRows } = await userSupabase
    .from("projects")
    .select("id, owner_id")
    .is("deleted_at", null);

  return buildMembersByProject(
    service,
    (projectRows ?? []) as { id: string; owner_id: string }[]
  );
}

/**
 * Same as `loadMembersByProject`, for callers that already read the project
 * rows themselves (GET /api/me/board needs `projectIds` for other lookups).
 */
export async function buildMembersByProject(
  service: SupabaseClient,
  projectRows: { id: string; owner_id: string }[]
): Promise<{ members: Record<string, Member[]>; projectIds: string[] }> {
  const projectIds = projectRows.map((p) => p.id);

  const { data: memberRows } = projectIds.length
    ? await service
        .from("project_members")
        .select("project_id, user_id, role")
        .in("project_id", projectIds)
        .order("created_at", { ascending: true })
    : { data: [] as { project_id: string; user_id: string }[] };

  const ids = [
    ...projectRows.map((p) => p.owner_id),
    ...(memberRows ?? []).map((m) => m.user_id as string),
  ];
  const [usersById, seeds] = await Promise.all([
    fetchAuthUsersById(service, ids),
    fetchAvatarSeeds(service, ids),
  ]);

  const members: Record<string, Member[]> = {};
  for (const p of projectRows) {
    members[p.id] = [
      {
        user_id: p.owner_id,
        ...toNamed(usersById.get(p.owner_id)),
        avatar_seed: seeds.get(p.owner_id) ?? p.owner_id,
        role: "owner",
        is_owner: true,
      },
    ];
  }
  for (const m of (memberRows ?? []) as { project_id: string; user_id: string }[]) {
    (members[m.project_id] ??= []).push({
      user_id: m.user_id,
      ...toNamed(usersById.get(m.user_id)),
      avatar_seed: seeds.get(m.user_id) ?? m.user_id,
      role: "member",
      is_owner: false,
    });
  }

  return { members, projectIds };
}
