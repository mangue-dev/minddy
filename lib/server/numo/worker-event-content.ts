import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { shouldEncryptDelegationResult } from "@/lib/server/agent/run-delegation-result-content";

type EncryptedWorkerPayload = {
  encrypted_worker_payload: string;
  encryption_version: number;
  project_id: string;
  event_id: string;
  run_id: string;
};

function binding(projectId: string, eventId: string) {
  if (!projectId || !eventId) throw new Error("Worker event scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "numo_turn_events", column: "payload", rowId: eventId };
}

function encrypted(value: unknown): value is EncryptedWorkerPayload {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, "encrypted_worker_payload");
}

export async function encodeWorkerEventPayload(service: SupabaseClient, input: {
  projectId: string; runId: string; eventId: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  if (!await shouldEncryptDelegationResult(service, input.projectId)) return input.payload;
  const store = getEncryptedStore();
  const cipher = await store.encrypt(input.payload, binding(input.projectId, input.eventId));
  return { encrypted_worker_payload: cipher,
    encryption_version: store.versionOf(cipher), project_id: input.projectId,
    event_id: input.eventId, run_id: input.runId };
}

export async function decodeWorkerEventPayload(value: Record<string, unknown>,
  actorId: string | null = null, expectedEventId: string | null = null,
  expectedRunId: string | null = null): Promise<Record<string, unknown>> {
  if (!encrypted(value)) return value;
  if (typeof value.encrypted_worker_payload !== "string" ||
      !Number.isSafeInteger(value.encryption_version) || value.encryption_version < 1 ||
      typeof value.project_id !== "string" || typeof value.event_id !== "string" ||
      typeof value.run_id !== "string" ||
      (expectedEventId !== null && value.event_id !== expectedEventId) ||
      (expectedRunId !== null && value.run_id !== expectedRunId)) {
    throw new Error("Invalid encrypted worker event");
  }
  const context = binding(value.project_id, value.event_id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<Record<string, unknown>>(value.encrypted_worker_payload);
  if (store.versionOf(cipher) !== value.encryption_version) {
    throw new Error("Worker event key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      decoded.run_id !== value.run_id) {
    throw new Error("Invalid worker event content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}
