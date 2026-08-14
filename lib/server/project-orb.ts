import "server-only";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * La graine de l'orbe d'un projet (`projects.orb_seed`), côté écriture.
 *
 * Même geste que l'avatar d'un compte (`lib/server/avatar-seeds.ts`) : l'orbe
 * ne se choisit pas, elle se relance. Le tirage est fait ICI et non par la base
 * — le défaut d'une colonne ne s'applique qu'à l'insertion, et PostgREST ne sait
 * pas écrire `set orb_seed = gen_random_uuid()`. Même source d'aléa (UUID v4),
 * donc même qualité de tirage.
 *
 * L'appelant a déjà vérifié que l'utilisateur est owner du projet, comme pour
 * l'icône : la table n'a pas de policy d'update pour ce champ, tout passe par la
 * clé de service.
 */
export async function regenerateProjectOrbSeed(projectId: string): Promise<string> {
  const seed = crypto.randomUUID();
  const { error } = await getServiceClient()
    .from("projects")
    .update({ orb_seed: seed })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  return seed;
}
