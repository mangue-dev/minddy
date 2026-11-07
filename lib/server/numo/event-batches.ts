import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Background Numo's event batches (MIN-926, first brick of MIN-925).
 *
 * The routine journal (`routine_events`) records every workspace change. Each
 * journal row that survives `isBatchableEvent` joins the open batch of every
 * project member who should hear about it (`route_numo_event`, in SQL so the
 * recipients and the debounce are decided under one row lock). A batch is due
 * five minutes after its last event and never later than ten minutes after its
 * first. The routines clock then claims due batches and hands each to
 * `processNumoEventBatch` exactly once.
 *
 * Nothing here calls a model: without an event there is no batch, and the
 * filter keeps background maintenance and Numo's own writes out.
 */

/** The journal fields the filter reads. */
export interface BatchableEvent {
  id: number;
  subject_type: string;
  event: string;
  actor_kind?: string | null;
  changed_fields?: string[] | null;
  after_state?: Record<string, unknown> | null;
}

export interface NumoEventBatch {
  id: string;
  user_id: string;
  opened_at: string;
  due_at: string;
  event_ids: number[];
  status: "open" | "processing" | "done";
  claimed_at: string | null;
  attempts: number;
}

/** Columns whose change alone is no news: order, maintenance, derived data. */
const NOISE_FIELDS = new Set([
  "position", "sort_order", "favorite", "version", "search_text", "search_tsv",
  "embedding", "analyzed_at", "analysis_claimed_at", "analysis_failures", "classified_at",
  "vote_count", "suggested_merge_into_id", "suggested_confidence", "sensitivity", "moderation_reason",
  "translated_title", "translated_body", "translated_language", "source_language",
  "remote_url", "updated_kind", "updated_api_key_id",
  // Who saved last: it changes with the content, never meaningfully alone.
  "updated_by",
  // Bumped by every write of a protected or collaborative row, whatever it
  // changed (the collaboration reset bumps only these).
  "encryption_revision", "content_revision", "body_revision", "title_revision",
]);
const NOISE_SUFFIX = /_(checked|attempted|synced)_at$/;

function isNoiseField(field: string): boolean {
  return NOISE_FIELDS.has(field) || NOISE_SUFFIX.test(field);
}

/**
 * The deterministic, deliberately broad filter. It drops Numo's writes,
 * maintenance (re-sealing, rollovers, recurrence), edits that only move or
 * re-derive a row, and routine runs that ended well. Which pull request
 * gestures are journaled at all is decided in SQL (`capture_numo_event`).
 * Everything else is left to the decision model (MIN-928), which knows what
 * the user cares about.
 *
 * A changed `encryption_version` is not noise: the first edit of a legacy row
 * or the first edit after a key rotation seals it too. The re-sealing passes
 * themselves run as maintenance.
 */
export function isBatchableEvent(event: BatchableEvent): boolean {
  if (event.actor_kind === "numo" || event.actor_kind === "maintenance") return false;
  if (event.event === "routine.finished") return event.after_state?.status === "failed";
  const changed = event.changed_fields;
  if (changed && ["issue.updated", "page.updated", "feedback.updated"].includes(event.event)) {
    if (changed.every(isNoiseField)) return false;
  }
  return true;
}

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/**
 * Add one journal row to the batches of the members it concerns. Returns the
 * number of batches opened or extended. The database marks the row as routed
 * in the same transaction, filtered or not, so a replayed row never counts
 * twice, even once its first batch has closed.
 */
export async function routeEventToBatches(event: BatchableEvent): Promise<number> {
  const { data, error } = await getServiceClient().rpc("route_numo_event", {
    p_event_id: event.id,
    p_batchable: isBatchableEvent(event),
  });
  check(error);
  return typeof data === "number" ? data : 0;
}

/** Columns the filter reads, for rows fetched outside the routines worker. */
const BATCHABLE_COLUMNS = "id, subject_type, event, actor_kind, changed_fields, after_state";

/**
 * Route journal rows of the last hour that were finished without being
 * routed: a routing failure, or a row the previous release processed during
 * a deploy. Older rows are left alone; their batch would already be stale.
 */
export async function sweepUnroutedEvents(limit: number): Promise<number> {
  const { data, error } = await getServiceClient().from("routine_events").select(BATCHABLE_COLUMNS)
    .not("processed_at", "is", null).is("numo_routed_at", null)
    .gte("created_at", new Date(Date.now() - 3_600_000).toISOString())
    .order("id").limit(limit);
  check(error);
  let routed = 0;
  for (const row of (data ?? []) as BatchableEvent[]) routed += await routeEventToBatches(row);
  return routed;
}

/**
 * Move due batches from open to processing in one conditional statement, so
 * two overlapping ticks never get the same batch. A batch whose worker died
 * is handed out again after 15 minutes, at most three times in all.
 */
export async function claimDueBatches(limit: number): Promise<NumoEventBatch[]> {
  const { data, error } = await getServiceClient().rpc("claim_numo_event_batches", { p_limit: limit });
  check(error);
  return (data ?? []) as NumoEventBatch[];
}

/**
 * A batch handed out three times is dropped rather than retried forever. The
 * SQL claim applies the same cap to a batch whose worker died mid-triage.
 */
const MAX_BATCH_ATTEMPTS = 3;

/**
 * What happens to a claimed batch. The decision model's triage (MIN-928)
 * replaces this default, which wakes nobody: the batch is only closed.
 */
export type NumoBatchTriage = (batch: NumoEventBatch) => Promise<void>;

const closeWithoutWaking: NumoBatchTriage = async () => {};

/** False when another worker reclaimed the batch meanwhile: it owns it now. */
async function closeBatch(batch: NumoEventBatch, errorCode: string | null): Promise<boolean> {
  const { data, error } = await getServiceClient().from("numo_event_batches")
    .update({ status: "done", closed_at: new Date().toISOString(), error_code: errorCode })
    .eq("id", batch.id).eq("status", "processing").eq("attempts", batch.attempts)
    .select("id");
  check(error);
  return (data?.length ?? 0) > 0;
}

/** Triage one claimed batch, then close it. A failure is retried by a later tick. */
export async function processNumoEventBatch(batch: NumoEventBatch, triage: NumoBatchTriage = closeWithoutWaking) {
  try {
    await triage(batch);
  } catch (error) {
    if (batch.attempts < MAX_BATCH_ATTEMPTS) throw error;
    return await closeBatch(batch, "triageFailed") ? "failed" as const : "superseded" as const;
  }
  return await closeBatch(batch, null) ? "done" as const : "superseded" as const;
}

/** The clock's share of the work: claim due batches and process each once. */
export async function drainNumoEventBatches(limit = 20, triage?: NumoBatchTriage) {
  const batches = await claimDueBatches(limit);
  const outcomes: Array<{ id: string; outcome: string }> = [];
  for (const batch of batches) {
    try {
      outcomes.push({ id: batch.id, outcome: await processNumoEventBatch(batch, triage) });
    } catch (error) {
      // The batch stays processing; it is handed out again after its lease.
      console.error("[numo-batches] triage failed:", (error as Error).message);
      outcomes.push({ id: batch.id, outcome: "retry" });
    }
  }
  return { claimed: batches.length, outcomes };
}
