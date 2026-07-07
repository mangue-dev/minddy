import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface EventRow {
  issue_id: string;
  /** NULL when the action comes from an integration (no user behind it). */
  actor_id: string | null;
  type: string;
  field?: string | null;
  from_value?: string | null;
  to_value?: string | null;
  /** True when the action was triggered through Numo (the assistant); the
      timeline then shows "Numo" as the actor instead of the user. */
  via_assistant?: boolean;
  /** Set when the action comes from a project integration (Feedback API); the
      timeline then shows the integration's name as the actor. */
  integration_id?: string | null;
}

/** Stamp a batch of events as assistant-triggered (no-op when false). */
export function stampViaAssistant(rows: EventRow[], viaAssistant: boolean): EventRow[] {
  if (!viaAssistant) return rows;
  return rows.map((r) => ({ ...r, via_assistant: true }));
}

/** Stamp a batch of events as integration-triggered (no-op when falsy). */
export function stampIntegration(
  rows: EventRow[],
  integrationId: string | null | undefined
): EventRow[] {
  if (!integrationId) return rows;
  return rows.map((r) => ({ ...r, integration_id: integrationId }));
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
