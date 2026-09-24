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
  return isContentEncryptionEnabled() &&
    (process.env.MINDDY_AGENT_RESULT_ENCRYPTION_ENABLED === "true" ||
     process.env.MINDDY_AGENT_WORK_BRANCH_ENCRYPTION_ENABLED === "true");
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

async function projectForRun(runId: string, conversationId: string): Promise<string> {
  const { data, error } = await getServiceClient().from("agent_runs")
    .select("project_id").eq("id", runId).maybeSingle();
  if (error) throw new Error("Worker run scope is unavailable");
  if (data?.project_id) return data.project_id as string;
  const { data: conversation, error: conversationError } = await getServiceClient()
    .from("conversations").select("project_id").eq("id", conversationId).maybeSingle();
  if (conversationError || !conversation?.project_id) {
    throw new Error("Orphan worker scope is unavailable");
  }
  return conversation.project_id as string;
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
    .order("payload_encryption_checked_at", { ascending: true, nullsFirst: true })
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
      const runId = typeof embeddedRun === "string" ? embeddedRun
        : turn.active_run_id as string | null;
      if (!runId || (turn.active_run_id && runId !== turn.active_run_id)) {
        throw new Error("Worker event run is ambiguous");
      }
      const projectId = await projectForRun(runId, turn.conversation_id as string);
      const version = await currentVersion(projectId);
      const identity = { p_id: event.id, p_old_payload: event.payload };
      const decoded = await decodeWorkerEventPayload(event.payload, null,
        event.id, runId);
      if (isEncrypted(event.payload) &&
          event.payload.encryption_version === version &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(
            event.payload.encrypted_worker_payload as string)) === 3) {
        const checked = await service.rpc("migrate_numo_worker_event", identity);
        if (checked.error) throw new Error("Unable to mark Numo worker event attempt");
        if (checked.data) result.unchanged++; else result.conflicted++;
        continue;
      }
      const wrapped = await replacement(projectId, runId, event.id, decoded);
      if (signal?.aborted) { result.interrupted = true; break; }
      const committed = await service.rpc("migrate_numo_worker_event", {
        ...identity, p_new_payload: wrapped,
      });
      if (committed.error) throw new Error("Unable to convert Numo worker event");
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
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
    .order("worker_checkpoint_encryption_checked_at", { ascending: true, nullsFirst: true })
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
        const checked = await service.rpc("migrate_numo_worker_checkpoint", identity);
        if (checked.error) throw new Error("Unable to mark Numo worker checkpoint attempt");
        if (checked.data) result.unchanged++; else result.conflicted++;
        continue;
      }
      const embeddedRun = payload.run_id;
      const runId = turn.active_run_id ??
        (typeof embeddedRun === "string" ? embeddedRun : null);
      if (!runId) throw new Error("Worker checkpoint run is unavailable");
      const projectId = await projectForRun(runId, turn.conversation_id);
      const eventId = isEncrypted(payload) && typeof payload.event_id === "string"
        ? payload.event_id : turn.id;
      const decoded = await decodeWorkerEventPayload(payload, null, null, runId);
      const version = await currentVersion(projectId);
      if (isEncrypted(payload) && payload.encryption_version === version &&
          getEncryptedStore().formatOf(getEncryptedStore().fromDatabase(
            payload.encrypted_worker_payload as string)) === 3) {
        const checked = await service.rpc("migrate_numo_worker_checkpoint", identity);
        if (checked.error) throw new Error("Unable to mark Numo worker checkpoint attempt");
        if (checked.data) result.unchanged++; else result.conflicted++;
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
      if (committed.data) result.migrated++; else result.conflicted++;
    } catch { result.failed++; }
  }
  return result;
}
