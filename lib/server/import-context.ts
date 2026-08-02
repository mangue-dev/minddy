import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import type { ImportContext } from "@/lib/import/types";

/**
 * Ce que le projet d'arrivée apporte au rapprochement : ses membres et ses
 * catégories (MIN-45 suite).
 *
 * Les deux routes d'import le chargent — celle qui propose un plan, pour que le
 * modèle voie les gens et les catégories qui existent, et celle qui valide,
 * pour rejouer le plan contre la MÊME vérité. C'est ce second usage qui compte
 * : un identifiant de membre envoyé par le navigateur n'assigne que s'il est
 * dans cette liste-là (`sanitizeMapping`), donc la liste doit venir du serveur.
 *
 * Le propriétaire n'a pas de ligne `project_members` : son entrée est
 * synthétisée depuis `projects.owner_id`, comme partout ailleurs.
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
        // Le nom d'affichage Supabase, jamais l'e-mail brut — la même règle
        // qu'à l'écran (lib/display-name.ts).
        name: named.full_name ? displayName(named) : null,
      };
    }),
    categories: (categoryRows ?? []).map((c) => c.name as string),
    actorId,
  };
}
