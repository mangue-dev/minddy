import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatabaseProperty } from "@/lib/page-databases";
import { insertNotifications } from "@/lib/server/notifications";

export interface PeopleCellChange {
  propertyId: string;
  value: unknown;
  /** The value before the write; null for an entry being created. */
  expected: unknown;
}

function memberIds(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return typeof value === "string" ? [value] : [];
}

/**
 * Tell each member newly added to a people cell of an entry, once per write
 * however many people cells it touched. The actor is never notified.
 */
export async function notifyAddedPeople(service: SupabaseClient, {
  projectId, pageId, actorId, schema, changes,
}: {
  projectId: string;
  pageId: string;
  actorId: string;
  schema: readonly DatabaseProperty[];
  changes: readonly PeopleCellChange[];
}): Promise<void> {
  const added = new Set<string>();
  for (const change of changes) {
    if (schema.find((p) => p.id === change.propertyId)?.type !== "people") continue;
    const previous = memberIds(change.expected);
    for (const id of memberIds(change.value)) {
      if (typeof id === "string" && id !== actorId && !previous.includes(id)) added.add(id);
    }
  }
  await insertNotifications(service, [...added].map((userId) => ({
    user_id: userId,
    project_id: projectId,
    type: "page_mention" as const,
    issue_id: null,
    page_id: pageId,
    block_id: null,
    actor_id: actorId,
  })));
}
