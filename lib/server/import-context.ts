import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import type { ImportContext } from "@/lib/import/types";

/**
 * What the arrival project brings to the reconciliation: its members and its
 * categories (MIN-45 continued).
 *
 * The two import routes load it — the one that proposes a plan, so that the
 * model sees the people and categories that exist, and the one that valid,
 * to replay the plan against the SAME truth. It is this second use that counts
 *: a member identifier sent by the browser only assigns if it is
 * in this list (`sanitizeMapping`), so the list must come from the server.
 *
 * The owner does not have a `project_members` line: its entry is
 * synthesized from `projects.owner_id`, like everywhere else.
 */
export async function loadImportContext(
  projectId: string,
  actorId: string
): Promise<ImportContext> {
  const service = getServiceClient();

  const [{ data: project }, { data: memberRows }, { data: categoryRows }] =
    await Promise.all([
      service.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
      service.from("project_members").select("user_id").eq("project_id", projectId),
      service.from("categories").select("name").eq("project_id", projectId),
    ]);

  const ids = [
    ...(project?.owner_id ? [project.owner_id as string] : []),
    ...(memberRows ?? []).map((m) => m.user_id as string),
  ];
  const unique = [...new Set(ids)];
  const usersById = await fetchAuthUsersById(service, unique);

  return {
    members: unique.map((userId) => {
      const named = toNamed(usersById.get(userId));
      return {
        userId,
        email: named.email,
        // The Supabase display name, never the raw email — the same rule
        // only on the screen (lib/display-name.ts).
        name: named.full_name ? displayName(named) : null,
      };
    }),
    categories: (categoryRows ?? []).map((c) => c.name as string),
    actorId,
  };
}
