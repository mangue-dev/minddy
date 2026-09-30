import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeWorkerEventPayload } from "@/lib/server/numo/worker-event-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type WorkerPayload = Record<string, unknown>;
type WorkerEvent = { id: string; turn_id: string; type: string;
  payload: WorkerPayload; payload_encryption_checked_at: string | null };
type WorkerTurn = { id: string; conversation_id: string; active_run_id: string | null;
  checkpoint: Record<string, unknown> | null;
  worker_checkpoint_encryption_checked_at: string | null };
type Counters = { scanned: number; migrated: number; unchanged: number;
  conflicted: number; failed: number; interrupted: boolean };

function enabled() {
  return isContentEncryptionEnabled();
}

function counters(): Counters {
  return { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
}

function validateLimit(limit: number) {
  if (!enabled()) throw new Error("Agent result encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo worker batch size");
  }
}

function isEncrypted(value: WorkerPayload): boolean {
  return Object.prototype.hasOwnProperty.call(value, "encrypted_worker_payload");
}

async function markAttempt(kind: "event" | "checkpoint", id: string,
  old: WorkerPayload, allowStale = false) {
  const marked = await getServiceClient().rpc("mark_numo_worker_payload_attempt", {
    p_kind: kind, p_id: id, p_old: old, p_allow_stale: allowStale,
  });
  if (marked.error || !marked.data) {
    throw new Error("Unable to mark Numo worker attempt");
  }
}

async function projectForRun(embeddedRunId: string | null, conversationId: string,
  turnId: string, kind: "event" | "checkpoint", targetId: string): Promise<{
    runId: string; projectId: string;
  }> {
  const { data: binding, error: bindingError } = await getServiceClient()
    .rpc("lookup_numo_worker_legacy_binding", {
      p_kind: kind, p_id: targetId,
    });
  if (bindingError) throw new Error("Worker legacy binding is unavailable");
  const runId = embeddedRunId ?? binding?.run_id;
  if (!runId || (binding && (binding.run_id !== runId ||
      binding.turn_id !== turnId || binding.conversation_id !== conversationId))) {
    throw new Error("Worker event run is ambiguous");
  }
  const { data, error } = await getServiceClient().from("agent_runs")
    .select("project_id,parent_numo_turn_id,parent_numo_conversation_id")
    .eq("id", runId).maybeSingle();
  if (error || !data?.project_id) throw new Error("Worker run scope is unavailable");
  const { data: conversation, error: conversationError } = await getServiceClient()
    .from("conversations").select("project_id").eq("id", conversationId).maybeSingle();
  if (conversationError || !conversation?.project_id ||
      data.project_id !== conversation.project_id ||
      (binding && binding.project_id !== data.project_id) ||
      ((data.parent_numo_turn_id !== turnId ||
        data.parent_numo_conversation_id !== conversationId) &&
        !(data.parent_numo_turn_id === null &&
          data.parent_numo_conversation_id === null && binding))) {
    throw new Error("Worker run and turn scope mismatch");
  }
  if (!embeddedRunId && !binding) throw new Error("Worker run is unreviewed");
  return { runId, projectId: data.project_id as string };
}

async function currentVersion(projectId: string): Promise<number> {
  const key = await getContentKeys().current({ kind: "project", id: projectId });
  const version = key.version;
  key.bytes.fill(0);
  return version;
}

async function replacement(projectId: string, runId: string, eventId: string,
  payload: WorkerPayload): Promise<WorkerPayload> {
  const store = getEncryptedStore();
  const content = { ...payload, run_id: runId };
  const cipher = await store.encrypt(content, {
    scope: { kind: "project", id: projectId }, table: "numo_turn_events",
    column: "payload", rowId: eventId,
  });
  const wrapped = { encrypted_worker_payload: cipher,
    encryption_version: store.versionOf(cipher), project_id: projectId,
    event_id: eventId, run_id: runId };
  const verified = await decodeWorkerEventPayload(wrapped, null, eventId, runId);
  if (JSON.stringify(verified) !== JSON.stringify(content)) {
    throw new Error("Worker payload migration verification failed");
  }
  return wrapped;
}

/** Convert and rotate durable worker events and their matching turn copies. */
export async function backfillNumoWorkerEventsBatch(limit = 20,
  signal?: AbortSignal): Promise<Counters> {
  validateLimit(limit);
  const result = counters();
  const service = getServiceClient();
  const { data, error } = await service.from("numo_turn_events")
    .select("id,turn_id,type,payload,payload_encryption_checked_at")
    .in("type", ["worker_completed", "worker_failed", "worker_input"])
    .order("payload_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo worker events");
  for (const event of (data ?? []) as WorkerEvent[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const { data: turn, error: turnError } = await service.from("numo_assistant_turns")
        .select("active_run_id,conversation_id").eq("id", event.turn_id).maybeSingle();
      if (turnError || !turn) throw new Error("Worker turn is unavailable");
      const embeddedRun = event.payload.run_id;
      const scope = await projectForRun(
        typeof embeddedRun === "string" ? embeddedRun : null,
        turn.conversation_id as string, event.turn_id, "event", event.id);
      const { runId, projectId } = scope;
      if (isEncrypted(event.payload) && event.payload.project_id !== projectId) {
        throw new Error("Worker event ciphertext scope mismatch");
      }
      const version = await currentVersion(projectId);
      const identity = { p_id: event.id, p_old_payload: event.payload };
      const decoded = await decodeWorkerEventPayload(event.payload, null,
        event.id, runId);
      if (isEncrypted(event.payload) &&
          event.payload.encryption_version === version &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(
            event.payload.encrypted_worker_payload as string)) === 3) {
        const checked = await service.rpc("migrate_numo_worker_event", {
          ...identity, ...(event.payload_encryption_checked_at === null
            ? { p_new_payload: event.payload } : {}),
        });
        if (checked.error) throw new Error("Unable to mark Numo worker event attempt");
        if (checked.data) result.unchanged++;
        else {
          result.conflicted++;
          await markAttempt("event", event.id, event.payload, true);
        }
        continue;
      }
      const wrapped = await replacement(projectId, runId, event.id, decoded);
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_numo_worker_event", {
        ...identity, p_new_payload: wrapped,
      });
      if (committed.error) throw new Error("Unable to convert Numo worker event");
      if (committed.data) result.migrated++;
      else {
        result.conflicted++;
        await markAttempt("event", event.id, event.payload, true);
      }
    } catch {
      result.failed++;
      await markAttempt("event", event.id, event.payload, true);
    }
  }
  return result;
}

/** Convert checkpoints whose event row was pruned or no longer matches. */
export async function backfillNumoWorkerCheckpointsBatch(limit = 20,
  signal?: AbortSignal): Promise<Counters> {
  validateLimit(limit);
  const result = counters();
  const service = getServiceClient();
  const { data, error } = await service.from("numo_assistant_turns")
    .select("id,conversation_id,active_run_id,checkpoint,worker_checkpoint_encryption_checked_at")
    .not("checkpoint->worker_event", "is", null)
    .order("worker_checkpoint_encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo worker checkpoints");
  for (const turn of (data ?? []) as WorkerTurn[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const worker = turn.checkpoint?.worker_event;
      const payload = worker && typeof worker === "object" &&
        !Array.isArray(worker) ? (worker as { payload?: WorkerPayload }).payload : null;
      const identity = { p_id: turn.id, p_old_checkpoint: turn.checkpoint };
      if (!payload || Object.keys(payload).length === 0) {
        throw new Error("Worker checkpoint payload is unverified");
      }
      const embeddedRun = payload.run_id;
      const { runId, projectId } = await projectForRun(
        typeof embeddedRun === "string" ? embeddedRun : null,
        turn.conversation_id, turn.id, "checkpoint", turn.id);
      if (isEncrypted(payload) && payload.project_id !== projectId) {
        throw new Error("Worker checkpoint ciphertext scope mismatch");
      }
      const eventId = isEncrypted(payload) && typeof payload.event_id === "string"
        ? payload.event_id : turn.id;
      const decoded = await decodeWorkerEventPayload(payload, null, null, runId);
      const version = await currentVersion(projectId);
      if (isEncrypted(payload) && payload.encryption_version === version &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(
            payload.encrypted_worker_payload as string)) === 3) {
        const checked = await service.rpc("migrate_numo_worker_checkpoint", {
          ...identity, ...(turn.worker_checkpoint_encryption_checked_at === null
            ? { p_new_checkpoint: turn.checkpoint } : {}),
        });
        if (checked.error) throw new Error("Unable to mark Numo worker checkpoint attempt");
        if (checked.data) result.unchanged++;
        else {
          result.conflicted++;
          await markAttempt("checkpoint", turn.id, turn.checkpoint!, true);
        }
        continue;
      }
      const wrapped = await replacement(projectId, runId, eventId, decoded);
      const checkpoint = { ...turn.checkpoint, worker_event: {
        ...(worker as Record<string, unknown>), payload: wrapped,
      } };
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_numo_worker_checkpoint", {
        ...identity, p_new_checkpoint: checkpoint,
      });
      if (committed.error) throw new Error("Unable to convert Numo worker checkpoint");
      if (committed.data) result.migrated++;
      else {
        result.conflicted++;
        await markAttempt("checkpoint", turn.id, turn.checkpoint!, true);
      }
    } catch {
      result.failed++;
      await markAttempt("checkpoint", turn.id, turn.checkpoint!, true);
    }
  }
  return result;
}
