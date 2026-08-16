import { getProjectAccess } from "@/lib/server/project-access";

/** La visibilite appartient a la conversation, jamais a son contexte ou a son
 * mode de lancement. */
export type AgentConversationVisibility = "private" | "project";

export interface ConversationAccessRecord {
  project_id: string;
  owner_id: string | null;
  visibility: AgentConversationVisibility;
}

export interface RunAnchors {
  routine_id: string | null;
  chain_id: string | null;
  pull_request_id: string | null;
}

export interface RunVisibility extends RunAnchors {
  project_id: string;
  created_by: string | null;
  conversation?: Pick<ConversationAccessRecord, "owner_id" | "visibility"> | null;
}

/**
 * Compatibilite pour les seuls lecteurs d'une ancienne ligne non jointe. Ce
 * predicat ne doit plus servir a creer une politique : il traduit uniquement la
 * visibilite historique lors d'un deploiement roulant.
 */
export function isSharedRun(run: RunAnchors): boolean {
  return Boolean(run.routine_id ?? run.chain_id ?? run.pull_request_id);
}

export function canReadConversationRecord(
  userId: string,
  conversation: Pick<ConversationAccessRecord, "owner_id" | "visibility">,
): boolean {
  return conversation.visibility === "project" || conversation.owner_id === userId;
}

/** Membre du projet puis visibilite EXPLICITE de la conversation. */
export async function canReadAgentRun(
  userId: string,
  run: RunVisibility,
): Promise<boolean> {
  const access = await getProjectAccess(userId, run.project_id);
  if (!access) return false;
  if (run.conversation) return canReadConversationRecord(userId, run.conversation);

  // Ancien objet construit a la main ou application deployee juste avant la
  // migration. A supprimer une fois tous les producteurs passes a la jointure.
  return isSharedRun(run) || run.created_by === userId;
}
