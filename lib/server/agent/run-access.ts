import { getProjectAccess } from "@/lib/server/project-access";

/** Visibility belongs to the conversation, never to its context or its
 * launch mode. */
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
 * Compatibility for readers of an old, unjoined line only. This
 * predicate should no longer be used to create a policy: it only reflects the
 * historical visibility during a rolling deployment.
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

/** Project member then EXPLICIT visibility of the conversation. */
export async function canReadAgentRun(
  userId: string,
  run: RunVisibility,
): Promise<boolean> {
  const access = await getProjectAccess(userId, run.project_id);
  if (!access) return false;
  if (run.conversation) return canReadConversationRecord(userId, run.conversation);

  // Old hand-built object or application deployed just before the
  // migration. To be deleted once all the producers have passed the join.
  return isSharedRun(run) || run.created_by === userId;
}
