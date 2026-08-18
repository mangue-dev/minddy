import "server-only";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * The seed of the orb of a project (`projects.orb_seed`), on the writing side.
 *
 * Same gesture as the avatar of an account (`lib/server/avatar-seeds.ts`): the orb
 * is not chosen, it restarts. The draw is done HERE and not by the base
 * — the default of a column only applies to the insertion, and PostgREST does not know
 * to write `set orb_seed = gen_random_uuid()`. Same random source (UUID v4),
 * therefore same draw quality.
 *
 * The caller has already verified that the user is the owner of the project, as for
 * the icon: the table does not have an update policy for this field, everything goes through the
 * service key.
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
