import "server-only";
import { commentStore } from "@/lib/server/comment-store";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeRoutine } from "@/lib/server/routine-content";
import { decodeIssue } from "@/lib/server/issue-store";
import { decodePage } from "@/lib/server/page-content";
import { getProjectAccess, hasProjectAccess } from "@/lib/server/project-access";
import { startRoutineOccurrence } from "@/lib/server/routine-occurrences";
import { assertPropertyConditions, evaluateRoutineConditions, parseRoutineTrigger, RoutineTriggerError, type ConditionContext, type RoutineTrigger } from "@/lib/routine-triggers";
import type { Routine } from "@/lib/server/routines";

export interface RoutineEventRow {
  id: number; project_id: string; subject_type: "issue" | "page" | "feedback"; subject_id: string;
  event: string; source_id: string | null; before_state: Record<string, unknown>; after_state: Record<string, unknown>;
  cause_routine_id: string | null; cause_routine_ids?: string[]; created_at: string; lease_token: string; attempts: number;
}
interface Arming {
  id: string; routine_id: string; revision: number; event_id: number; project_id: string;
  subject_type: RoutineEventRow["subject_type"]; subject_id: string;
  retry_at: string; state: string; request_id: string; lease_token: string | null; attempts: number;
}
interface AdmissionBudget { remaining: number }
function single<T>(value: unknown): T | null { return (Array.isArray(value) ? value[0] : value) as T | null; }
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }

export function eventMatchesTrigger(trigger: RoutineTrigger, event: RoutineEventRow): boolean {
  if (trigger.type === "schedule") return false;
  if (trigger.type === "database") return event.event === "page.arrived" && event.after_state.parent_id === trigger.databaseId;
  if (trigger.event === "issue.status_changed") return ["issue.created", "issue.status_changed"].includes(event.event) && event.after_state.status === trigger.status;
  if (trigger.event === "issue.assigned") return event.event === "issue.assigned" && (!trigger.assigneeId || trigger.assigneeId === event.after_state.assignee);
  if (trigger.event === "issue.comment_added") return event.event === trigger.event && event.subject_id === trigger.issueId;
  return event.event === trigger.event;
}
export function eventCancelsArming(trigger: RoutineTrigger, event: RoutineEventRow): boolean {
  if (event.after_state.deleted) return true;
  if (trigger.type === "database") return event.subject_type === "page" && event.after_state.parent_id !== trigger.databaseId;
  if (trigger.type === "event" && trigger.event === "issue.status_changed") return event.event === "issue.status_changed" && event.after_state.status !== trigger.status;
  if (trigger.type === "event" && trigger.event === "issue.assigned") return ["issue.updated", "issue.status_changed", "issue.assigned"].includes(event.event) && Object.hasOwn(event.before_state, "assignee") && event.before_state.assignee !== event.after_state.assignee;
  return false;
}

/**
 * A comment whose author is CURRENTLY a reader of the project does not arm
 * comment-triggered routines (MIN-693): a reader must not start owner-billed,
 * owner-authority work. Numo's reply to a reader's mention is written as the
 * reader's comment, so it is covered the same way. Members' and owners'
 * comments behave as before; a removed author is not a reader.
 */
async function commentByReader(projectId: string, event: Pick<RoutineEventRow, "event" | "source_id">): Promise<boolean> {
  if (event.event !== "issue.comment_added" || !event.source_id) return false;
  const result = await commentStore(getServiceClient()).select("author_id").eq("id", event.source_id).maybeSingle();
  check(result.error);
  const authorId = result.data?.author_id;
  if (typeof authorId !== "string") return false;
  return (await hasProjectAccess(authorId, projectId))?.role === "reader";
}

async function subjectContext(routine: Routine, arming: Arming, trigger: RoutineTrigger): Promise<ConditionContext | null> {
  const service = getServiceClient();
  const table = arming.subject_type === "issue" ? "issues" : arming.subject_type === "page" ? "pages" : "feedback_posts";
  const result = await service.from(table).select("*").eq("id", arming.subject_id).eq("project_id", routine.project_id).is("deleted_at", null).maybeSingle();
  check(result.error);
  if (!result.data) return null;
  if (arming.subject_type === "issue") {
    const issue = await decodeIssue(result.data, routine.owner_id);
    const categories = await service.from("issue_categories").select("category_id").eq("issue_id", arming.subject_id);
    check(categories.error);
    return { status: issue.status as string, assignee: issue.assignee_id as string | null, priority: issue.priority as string, effort: issue.effort as string | null, category: (categories.data ?? []).map(c => c.category_id as string) };
  }
  if (arming.subject_type === "page" && trigger.type === "database") {
    const page = await decodePage(result.data, routine.owner_id);
    if (page.parent_id !== trigger.databaseId) return null;
    const parent = await service.from("pages").select("*").eq("id", trigger.databaseId).eq("project_id", routine.project_id).is("deleted_at", null).maybeSingle();
    check(parent.error);
    if (!parent.data) return null;
    const database = await decodePage(parent.data, routine.owner_id);
    if (!database.database_schema) throw new RoutineTriggerError("invalidConditionReference");
    assertPropertyConditions(trigger, database.database_schema);
    const properties = { ...page.property_values };
    for (const p of database.database_schema) if (p.type === "created_at") properties[p.id] = page.created_at;
    return { properties, schema: database.database_schema };
  }
  // Feedback remains private and retains its moderation state; only its ID is
  // carried into the owner's private Numo conversation.
  return {};
}

async function evaluateArming(arming: Arming, routine: Routine, budget: AdmissionBudget, event?: RoutineEventRow): Promise<void> {
  const service = getServiceClient();
  const update = async (values: Record<string, unknown>) => {
    const result = await service.from("routine_armings").update({ ...values, updated_at: new Date().toISOString() }).eq("id", arming.id).in("state", ["armed", "reserved"]);
    check(result.error);
  };
  const access = await getProjectAccess(routine.owner_id, routine.project_id);
  if (!access?.isOwner || !routine.enabled || arming.revision !== routine.trigger_revision) { await update({ state: "cancelled" }); return; }
  const trigger = parseRoutineTrigger(routine.trigger);
  // Re-checked at evaluation, so a delayed arming follows the author's role now.
  if (trigger.type === "event" && trigger.event === "issue.comment_added") {
    const sourceResult = event?.id === arming.event_id ? { data: event, error: null } : await service.from("routine_events").select("event, source_id").eq("id", arming.event_id).maybeSingle();
    check(sourceResult.error);
    if (sourceResult.data && await commentByReader(routine.project_id, sourceResult.data)) { await update({ state: "cancelled" }); return; }
  }
  if (event?.cause_routine_id === routine.id || event?.cause_routine_ids?.includes(routine.id)) return;
  if (event && event.id !== arming.event_id && eventCancelsArming(trigger, event)) { await update({ state: "cancelled" }); return; }
  // Continue processing cancellation events after the admission allowance is
  // spent. Other armings retain their identity and remain eligible next tick.
  if (budget.remaining <= 0) return;
  let context: ConditionContext | null;
  try { context = await subjectContext(routine, arming, trigger); }
  catch (error) {
    if (!(error instanceof RoutineTriggerError)) throw error;
    await update({ error_code: error.code, retry_at: new Date(Date.now() + 300_000).toISOString() });
    return;
  }
  if (!context) { await update({ state: "cancelled" }); return; }
  if (event?.subject_type === "issue" && event.after_state.status) {
    context = { ...context, ...event.after_state } as ConditionContext;
  }
  if (!event && trigger.type === "event" && trigger.event === "issue.status_changed" && context.status !== trigger.status) { await update({ state: "cancelled" }); return; }
  const admission = arming.state === "reserved" ? await service.from("numo_routine_occurrences").select("turn_id").eq("arming_id", arming.id).maybeSingle() : null;
  check(admission?.error ?? null);
  if (!admission?.data?.turn_id && !evaluateRoutineConditions(trigger.type === "schedule" ? undefined : trigger.conditions, context)) {
    await update({ retry_at: new Date(Math.max(Date.parse(arming.retry_at), Date.now() + 300_000)).toISOString(), error_code: null });
    return;
  }
  if (!event && trigger.type === "event" && trigger.event === "issue.assigned") {
    const source = await service.from("routine_events").select("after_state").eq("id", arming.event_id).maybeSingle();
    check(source.error);
    if (!source.data || context.assignee !== source.data.after_state.assignee) { await update({ state: "cancelled" }); return; }
  }
  const claim = await service.rpc("claim_routine_arming", { p_id: arming.id, p_revision: arming.revision });
  check(claim.error);
  const claimed = single<Arming>(claim.data);
  if (!claimed?.id) return;
  // Failed admissions count too, so quota failures cannot exhaust this tick.
  budget.remaining--;
  try {
    const sourceResult = await service.from("routine_events").select("cause_routine_ids").eq("id", claimed.event_id).maybeSingle();
    check(sourceResult.error);
    const source = sourceResult.data;
    await startRoutineOccurrence({ routine, origin: trigger.type === "database" ? "database" : "event", requestId: claimed.request_id, armingId: claimed.id, provenance: { eventId: String(claimed.event_id), subjectId: claimed.subject_id, subjectType: claimed.subject_type, causeRoutineIds: source?.cause_routine_ids ?? [] } });
    const bound = await service.from("routine_armings").update({ state: "consumed", lease_until: null, error_code: null }).eq("id", claimed.id).eq("lease_token", claimed.lease_token);
    check(bound.error);
    await service.from("agent_routines").update({ last_run_at: new Date().toISOString(), last_error: null }).eq("id", routine.id);
    // Admission persists a queued turn. The bounded Numo drain executes it;
    // model/tool execution must not hold this event's lease or delay schedules.
  } catch (error) {
    const code = (error as { code?: string }).code === "usage_budget_exceeded" || (error as Error).message === "usage_budget_exceeded" ? "quota" : "launchFailed";
    const result = await service.from("routine_armings").update({ state: claimed.attempts >= 8 ? "failed" : "reserved", error_code: code, lease_until: null, retry_at: new Date(Date.now() + Math.min(3600, 60 * 2 ** claimed.attempts) * 1000).toISOString() }).eq("id", claimed.id).eq("lease_token", claimed.lease_token).eq("state", "reserved");
    check(result.error);
  }
}

async function processEvent(event: RoutineEventRow, budget: AdmissionBudget) {
  const service = getServiceClient();
  const result = await service.from("agent_routines").select("*").eq("project_id", event.project_id).eq("enabled", true).is("deleted_at", null).neq("trigger_type", "schedule");
  check(result.error);
  const readerComment = (result.data?.length ?? 0) > 0 && await commentByReader(event.project_id, event);
  for (const row of result.data ?? []) {
    const routine = await decodeRoutine(row, row.owner_id) as unknown as Routine;
    const trigger = parseRoutineTrigger(routine.trigger);
    if (!readerComment && eventMatchesTrigger(trigger, event) && event.cause_routine_id !== routine.id && !event.cause_routine_ids?.includes(routine.id) && (event.cause_routine_ids?.length ?? 0) < 8) {
      const armed = await service.rpc("arm_routine_event", { p_routine_id: routine.id, p_revision: routine.trigger_revision, p_event_id: event.id, p_delay_minutes: trigger.type === "schedule" ? 0 : trigger.delayMinutes ?? 0 });
      check(armed.error);
    }
    const pending = await service.from("routine_armings").select("*").eq("routine_id", routine.id).eq("subject_type", event.subject_type).eq("subject_id", event.subject_id).in("state", ["armed", "reserved"]);
    check(pending.error);
    for (const arming of pending.data ?? []) await evaluateArming(arming as Arming, routine, budget, event);
  }
}

/** Bound journal rows and total admissions, including retries; never execute turns inline. */
export async function processRoutineEvents(limit = 20): Promise<{ events: number; retries: number }> {
  const service = getServiceClient();
  const budget: AdmissionBudget = { remaining: limit };
  let events = 0;
  while (events < limit) {
    const batch = await service.rpc("claim_routine_events", { p_limit: Math.min(limit - events, 10) });
    check(batch.error);
    if (!batch.data?.length) break;
    for (const event of batch.data as RoutineEventRow[]) {
      try {
        await processEvent(event, budget);
        const done = await service.from("routine_events").update({ processed_at: new Date().toISOString(), lease_until: null, error_code: null }).eq("id", event.id).eq("lease_token", event.lease_token);
        check(done.error);
      } catch {
        const failed = await service.from("routine_events").update({ error_code: "processingFailed", ...(event.attempts >= 8 ? { processed_at: new Date().toISOString() } : {}), lease_until: new Date(Date.now() + 60_000).toISOString() }).eq("id", event.id).eq("lease_token", event.lease_token);
        check(failed.error);
      }
      events++;
    }
  }
  const retry = await service.from("routine_armings").select("*").in("state", ["armed", "reserved"]).lte("retry_at", new Date().toISOString()).order("retry_at").limit(limit);
  check(retry.error);
  for (const arming of retry.data ?? []) {
    const row = await service.from("agent_routines").select("*").eq("id", arming.routine_id).is("deleted_at", null).maybeSingle();
    check(row.error);
    if (row.data) await evaluateArming(arming as Arming, await decodeRoutine(row.data, row.data.owner_id) as unknown as Routine, budget);
  }
  check((await service.rpc("cleanup_routine_events")).error);
  return { events, retries: retry.data?.length ?? 0 };
}
