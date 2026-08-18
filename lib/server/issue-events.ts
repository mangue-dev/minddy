import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchWebhooksForEvents } from "@/lib/server/webhooks";
import { diffPlanTasks, stripTaskStates, type PlanTaskState } from "@/lib/plan";

export interface EventRow {
  /** The parent is an issue OR an objective OR a feedback post OR a wiki page —
      exactly one is set (issue_events_parent_ck). */
  issue_id?: string | null;
  objective_id?: string | null;
  feedback_post_id?: string | null;
  /** A wiki PAGE (MIN-278): created, modified, trashed, restored. */
  page_id?: string | null;
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
      holding the user's API key); paired with api_key_id, the timeline shows
      the agent — "Claude Code (mcp)" — instead of the user. */
  via_mcp?: boolean;
  /** The API key behind an MCP action — its name is the displayed actor. */
  api_key_id?: string | null;
  /** Set when the action comes from a project integration (Feedback API); the
      timeline then shows the integration's name as the actor. */
  integration_id?: string | null;
  /** True when the assignment was made by Smart Assign (actor_id null); the
      timeline then shows "Smart Assign" as the actor. */
  via_smart_assign?: boolean;
  /** Paired with the flag above: the MODEL picked this assignee, from the
      per-member rules. False on the deterministic paths (solo project, no rule
      written, model call failed) — the timeline words the two differently. */
  smart_assign_ai?: boolean;
  /** True when Smart-fill (MIN-260) filled the issue's properties as it was
      created; the timeline then shows "Smart-fill" as the actor, and
      `to_value` lists the fields it set. */
  via_smart_fill?: boolean;
  /** True when the write came from a project AUTOMATION (MIN-147); the timeline
      then names the automation instead of the account whose id technically
      signs the write (the issue's assignee, or the project owner). */
  via_automation?: boolean;
  /** Provider ('github' | 'gitlab') when the write came from the linked repo's
      issue sync (MIN-97); the timeline then shows the forge as the actor. The
      actor_id stays set — the write needs a project member behind it. */
  forge_sync?: string | null;
  /**
 * THE TIME OF THE GESTURE, when it is not that of the insert.
 *
 * By default the column takes `now()`, and this is the right choice: the gesture has just taken place
 *. But an event written AFTER the response (`after()`) is
 * timestamped at its insert, not at its gesture — and it is then doubled by
 * everything written before the response (Smart Assign, relationships). The
 * timeline tells the order of WRITINGs instead of the order of gestures.
 *
 * Hence this field: a caller who defers its events freezes the moment at the
 * moment of the gesture and transmits it here. Left empty everywhere else.
 */
  created_at?: string;
}

/** Freezes the moment of the gesture on a batch of events (see `created_at` above). */
export function stampOccurredAt(rows: EventRow[], at: string): EventRow[] {
  return rows.map((r) => ({ created_at: at, ...r }));
}

/** Stamp a batch of events as assistant-triggered (no-op when false). */
export function stampViaAssistant(rows: EventRow[], viaAssistant: boolean): EventRow[] {
  if (!viaAssistant) return rows;
  return rows.map((r) => ({ ...r, via_assistant: true }));
}

/** Stamp a batch of events as written by a project AUTOMATION (MIN-147, no-op
 when false). CUMULATES with `stampViaAssistant`: a chain step is
 indeed a gesture of Numo, but the timeline must name the RULE — without that a
 status posed by the loop is indistinguishable from a run launched by hand. */
export function stampViaAutomation(rows: EventRow[], viaAutomation: boolean): EventRow[] {
  if (!viaAutomation) return rows;
  return rows.map((r) => ({ ...r, via_automation: true }));
}

/** Stamp a batch of events as MCP-triggered, attributed to the acting API key
    (no-op when falsy). */
export function stampMcpKey(
  rows: EventRow[],
  mcpKeyId: string | null | undefined
): EventRow[] {
  if (!mcpKeyId) return rows;
  return rows.map((r) => ({ ...r, via_mcp: true, api_key_id: mcpKeyId }));
}

/** Stamp a batch of events as integration-triggered (no-op when falsy). */
export function stampIntegration(
  rows: EventRow[],
  integrationId: string | null | undefined
): EventRow[] {
  if (!integrationId) return rows;
  return rows.map((r) => ({ ...r, integration_id: integrationId }));
}

/** Stamp a batch of events as produced by the linked repo's issue sync,
    attributed to the forge (no-op when falsy). */
export function stampForgeSync(
  rows: EventRow[],
  provider: string | null | undefined
): EventRow[] {
  if (!provider) return rows;
  return rows.map((r) => ({ ...r, forge_sync: provider }));
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
  "recurrence",
  "cycle_id",
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
  // insertEvents is the single funnel of issue events: it is the
  // dispatch point for integration webhooks (non-blocking, via after()).
  // Objective events do not carry webhooks — we only dispatch
  // the rows attached to an issue.
  const issueRows = rows.filter((r) => !!r.issue_id);
  if (issueRows.length > 0) dispatchWebhooksForEvents(service, issueRows);
}

// Goal fields tracked with from/to (the panel activity log
// objective). `name` reuses the “title” label on the describe side.
const OBJECTIVE_SCALAR_FIELDS = [
  "status",
  "lead_user_id",
  "target_date",
  "color",
] as const;

/**
 * Build activity events for an objective field-level diff (name, description
 * and the scalar fields). Like issues, a description change records only that
 * it changed (no diff). Mirror of buildFieldChangeEvents for objectives.
 */
export function buildObjectiveFieldChangeEvents(
  objectiveId: string,
  actorId: string,
  before: Record<string, unknown>,
  updates: Record<string, unknown>
): EventRow[] {
  const events: EventRow[] = [];

  if ("name" in updates && updates.name !== before.name) {
    events.push({
      objective_id: objectiveId,
      actor_id: actorId,
      type: "updated",
      field: "name",
      from_value: s(before.name),
      to_value: s(updates.name),
    });
  }
  if (
    "description" in updates &&
    (updates.description ?? null) !== (before.description ?? null)
  ) {
    events.push({
      objective_id: objectiveId,
      actor_id: actorId,
      type: "updated",
      field: "description",
    });
  }
  for (const f of OBJECTIVE_SCALAR_FIELDS) {
    if (f in updates && (updates[f] ?? null) !== (before[f] ?? null)) {
      events.push({
        objective_id: objectiveId,
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
