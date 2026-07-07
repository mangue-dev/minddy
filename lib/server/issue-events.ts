import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchWebhooksForEvents } from "@/lib/server/webhooks";
import { diffPlanTasks, stripTaskStates, type PlanTaskState } from "@/lib/plan";

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
  /** True when the action came through the MCP endpoint (external AI agent
      holding the user's API key); the timeline shows "user (via agent)". */
  via_mcp?: boolean;
  /** Set when the action comes from a project integration (Feedback API); the
      timeline then shows the integration's name as the actor. */
  integration_id?: string | null;
}

/** Stamp a batch of events as assistant-triggered (no-op when false). */
export function stampViaAssistant(rows: EventRow[], viaAssistant: boolean): EventRow[] {
  if (!viaAssistant) return rows;
  return rows.map((r) => ({ ...r, via_assistant: true }));
}

/** Stamp a batch of events as MCP-triggered (no-op when false). */
export function stampViaMcp(rows: EventRow[], viaMcp: boolean): EventRow[] {
  if (!viaMcp) return rows;
  return rows.map((r) => ({ ...r, via_mcp: true }));
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

const PLAN_TASK_EVENT_TYPES: Record<PlanTaskState, string> = {
  pending: "plan_task_reopened",
  in_progress: "plan_task_started",
  completed: "plan_task_completed",
  cancelled: "plan_task_cancelled",
};

/** Above this many state flips in one save (agent rewrote everything), the
 *  per-task events would flood the timeline — collapse to one "plan" event. */
const MAX_TASK_TRANSITION_EVENTS = 20;

/**
 * Events for a plan change: one plan_task_* event per state transition
 * (to_value = task text, from_value = previous state), plus a bare
 * `field: "plan"` event — the description precedent, no diff — only when the
 * content itself changed (not for pure checkbox flips).
 */
export function buildPlanChangeEvents(
  issueId: string,
  actorId: string,
  beforePlan: string | null,
  afterPlan: string | null
): EventRow[] {
  const events: EventRow[] = [];
  const transitions = diffPlanTasks(beforePlan, afterPlan);
  const contentChanged =
    stripTaskStates(beforePlan) !== stripTaskStates(afterPlan);

  if (transitions.length <= MAX_TASK_TRANSITION_EVENTS) {
    for (const t of transitions) {
      events.push({
        issue_id: issueId,
        actor_id: actorId,
        type: PLAN_TASK_EVENT_TYPES[t.to],
        field: "plan",
        from_value: t.from,
        to_value: t.text.slice(0, 200),
      });
    }
  }
  if (contentChanged || events.length === 0) {
    events.push({
      issue_id: issueId,
      actor_id: actorId,
      type: "updated",
      field: "plan",
    });
  }
  return events;
}

export async function insertEvents(
  service: SupabaseClient,
  rows: EventRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await service.from("issue_events").insert(rows);
  if (error) {
    console.error("[issue-events] insert failed:", error.message);
    return;
  }
  // insertEvents est l'entonnoir unique des événements d'issue : c'est le
  // point de dispatch des webhooks d'intégration (non bloquant, via after()).
  dispatchWebhooksForEvents(service, rows);
}
