import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EventRow {
  issue_id: string;
  actor_id: string;
  type: string;
  field?: string | null;
  from_value?: string | null;
  to_value?: string | null;
}

const s = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

// Scalar fields tracked with from/to values (plan §7).
const SCALAR_FIELDS = [
  "status",
  "priority",
  "effort",
  "assignee_id",
  "objective_id",
  "due_date",
] as const;

/**
 * Build activity events for a field-level diff (title, description, and the
 * scalar fields). Description records only that it changed — no diff (plan §7).
 * `parent` and category changes are recorded by the routes that own them.
 */
export function buildFieldChangeEvents(
  issueId: string,
  actorId: string,
  before: Record<string, unknown>,
  updates: Record<string, unknown>
): EventRow[] {
  const events: EventRow[] = [];

  if ("title" in updates && updates.title !== before.title) {
    events.push({
      issue_id: issueId,
      actor_id: actorId,
      type: "updated",
      field: "title",
      from_value: s(before.title),
      to_value: s(updates.title),
    });
  }
  if (
    "description" in updates &&
    (updates.description ?? null) !== (before.description ?? null)
  ) {
    events.push({
      issue_id: issueId,
      actor_id: actorId,
      type: "updated",
      field: "description",
    });
  }
  for (const f of SCALAR_FIELDS) {
    if (f in updates && (updates[f] ?? null) !== (before[f] ?? null)) {
      events.push({
        issue_id: issueId,
        actor_id: actorId,
        type: "updated",
        field: f,
        from_value: s(before[f]),
        to_value: s(updates[f]),
      });
    }
  }
  return events;
}

export async function insertEvents(
  service: SupabaseClient,
  rows: EventRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await service.from("issue_events").insert(rows);
  if (error) console.error("[issue-events] insert failed:", error.message);
}
