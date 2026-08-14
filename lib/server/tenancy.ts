import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CLOISONNEMENT DES RÉFÉRENCES SORTANTES (MIN-339).
 *
 * Un ticket ne porte pas que des scalaires : il pointe vers un objectif, un
 * ticket parent, un doublon, un cycle, une personne. Chacune de ces colonnes
 * est un `uuid` nu — la base ne dit nulle part qu'il doit désigner quelque
 * chose du MÊME projet, et les cœurs d'écriture (`create-issue`,
 * `update-issue`, `objectives`) tournent en clé service, RLS contournée.
 *
 * D'où la règle, une seule, appliquée à toutes : **une référence est suspecte
 * par défaut, elle doit être résolue DANS le périmètre du ticket, sinon
 * refusée**. Résoudre veut dire lire la ligne cible avec son `project_id`
 * épinglé (ou, pour un cycle, son propriétaire) : une référence qui ne
 * ressort pas de cette lecture n'existe pas, du point de vue de l'appelant.
 *
 * Les rendus sont volontairement des booléens : c'est l'appelant qui connaît
 * sa convention d'erreur (clé i18n pour les routes, message nu pour un tool).
 */

/** L'objectif existe-t-il, vivant, DANS ce projet ? */
export async function objectiveInProject(
  service: SupabaseClient,
  objectiveId: string,
  projectId: string
): Promise<boolean> {
  const { data } = await service
    .from("objectives")
    .select("id")
    .eq("id", objectiveId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/** Le ticket cible existe-t-il, hors corbeille, DANS ce projet ? */
export async function issueInProject(
  service: SupabaseClient,
  issueId: string,
  projectId: string
): Promise<boolean> {
  const { data } = await service
    .from("issues")
    .select("id")
    .eq("id", issueId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/**
 * Ce compte a-t-il accès au projet (propriétaire OU membre) ? Même règle que
 * `getProjectAccess`/`can_access_project`, sans le SELECT du projet quand
 * l'appelant tient déjà son `owner_id` (les cœurs d'écriture l'ont chargé avec
 * leur instantané d'avant).
 */
export async function userInProject(
  service: SupabaseClient,
  userId: string,
  projectId: string,
  ownerId?: string | null
): Promise<boolean> {
  if (ownerId && ownerId === userId) return true;
  if (ownerId === undefined) {
    const { data: project } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!project) return false;
    if ((project.owner_id as string) === userId) return true;
  }
  const { data } = await service
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/**
 * Ce cycle appartient-il à ce compte ? Un cycle est PERSONNEL — il n'a pas de
 * projet, il a un propriétaire, et y ranger un ticket l'affecte à celui-ci
 * (MIN-32). C'est donc la seule des cinq références dont le périmètre n'est
 * pas le projet mais l'appelant lui-même.
 */
export async function cycleBelongsToUser(
  service: SupabaseClient,
  cycleId: string,
  userId: string
): Promise<boolean> {
  const { data } = await service
    .from("cycles")
    .select("id")
    .eq("id", cycleId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}
