import { getProjectAccess } from "@/lib/server/project-access";

/**
 * QUI A LE DROIT DE LIRE UN RUN (MIN-332).
 *
 * La règle tenait à un seul endroit — la policy `agent_runs_select` — et quatre
 * chemins passaient à côté : les routes (clé service), `agent_run_messages`
 * (policy jamais resserrée), le trigger de diffusion et l'autorisation du topic
 * temps réel. Une règle portée à un seul endroit sur quatre n'est pas une règle :
 * elle vit désormais ici, et la migration jumelle la redit en SQL mot pour mot.
 *
 * LA RÈGLE. Une conversation avec Numo est PERSONNELLE, même quand son ticket est
 * public. Le ticket est un objet du projet ; ce qu'on a demandé à l'agent, la
 * façon dont on l'a repris, ce qu'il a répondu, c'est un geste de travail
 * individuel — et ce que l'équipe doit en voir, c'est le résultat (le ticket, la
 * branche, la pull request), pas le brouillon.
 *
 * Trois exceptions, et elles ont toutes la même forme : ce sont les runs que
 * PERSONNE n'a écrits à la première personne.
 *
 *  • `routine_id`      — un passage de routine. La routine est un objet du projet,
 *                        ses exécutions se lisent dans son détail, par tout membre.
 *  • `chain_id`        — une étape d'automatisation. Même chose : la chaîne est une
 *                        règle du projet, et son `created_by` n'est pas un acteur
 *                        mais le porteur de la règle. La réserver à lui rendrait
 *                        invisible à tous le travail que le projet a déclenché.
 *  • `pull_request_id` — une session de RELECTURE (MIN-168). Son sujet est une pull
 *                        request, sa sortie des commentaires publics, et la carte
 *                        « Numo relit cette PR » du fil est vue de tout le monde.
 *
 * Tout le reste — bouton, carnet, assistant, mention — appartient à son créateur.
 */

/** Les trois ancrages qui font d'un run un geste du projet. */
export interface RunAnchors {
  routine_id: string | null;
  chain_id: string | null;
  pull_request_id: string | null;
}

/** Ce qu'il faut d'un run pour trancher. `AgentRun` le satisfait tel quel. */
export interface RunVisibility extends RunAnchors {
  project_id: string;
  created_by: string | null;
}

/**
 * Ce run est-il un geste du PROJET plutôt qu'une conversation ?
 *
 * Pur, sans IO : c'est cette fonction-là que les tests exercent, et c'est elle
 * qu'il faut garder alignée avec le prédicat SQL de la migration.
 */
export function isSharedRun(run: RunAnchors): boolean {
  return Boolean(run.routine_id ?? run.chain_id ?? run.pull_request_id);
}

/**
 * `userId` peut-il lire ce run ? Membre du projet, ET — sauf run partagé — son
 * créateur.
 *
 * Les routes en tirent un 404, jamais un 403 : dire « interdit » apprendrait
 * déjà qu'un run porte cet identifiant.
 */
export async function canReadAgentRun(
  userId: string,
  run: RunVisibility,
): Promise<boolean> {
  const access = await getProjectAccess(userId, run.project_id);
  if (!access) return false;
  return isSharedRun(run) || run.created_by === userId;
}
