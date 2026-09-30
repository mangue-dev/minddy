import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

type StoredPayload = Record<string, unknown>;
type BoundPayload = StoredPayload & {
  encrypted_turn_payload: string;
  encryption_version: number;
  user_id: string;
  turn_id: string;
  event_id: string;
};
const KEYS = ["encrypted_turn_payload", "encryption_version", "user_id",
  "turn_id", "event_id"];

const binding = (userId: string, eventId: string) => ({
  scope: { kind: "user" as const, id: userId },
  table: "numo_turn_events", column: "payload", rowId: eventId,
});

export function isEncryptedNumoTurnEvent(value: StoredPayload):
  value is BoundPayload {
  return Object.hasOwn(value, "encrypted_turn_payload");
}

export async function shouldProtectNumoTurnEvents(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await service.from("numo_event_content_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve Numo event encryption state");
  }
  return !!data;
}

export async function encodeNumoTurnEvent(userId: string, turnId: string,
  eventId: string, payload: StoredPayload): Promise<StoredPayload> {
  if (!userId || !turnId || !eventId || isEncryptedNumoTurnEvent(payload)) {
    throw new Error("Invalid Numo event payload binding");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(payload, binding(userId, eventId));
  return { encrypted_turn_payload: cipher,
    encryption_version: store.versionOf(cipher), user_id: userId,
    turn_id: turnId, event_id: eventId };
}

export async function decodeNumoTurnEvent(value: StoredPayload,
  expected: { userId: string; turnId: string; eventId: string }):
  Promise<StoredPayload> {
  if (!isEncryptedNumoTurnEvent(value)) return value;
  if (Object.keys(value).length !== KEYS.length ||
      KEYS.some((key) => !Object.hasOwn(value, key)) ||
      typeof value.encrypted_turn_payload !== "string" ||
      !Number.isSafeInteger(value.encryption_version) ||
      value.encryption_version < 1 ||
      value.user_id !== expected.userId ||
      value.turn_id !== expected.turnId ||
      value.event_id !== expected.eventId) {
    throw new Error("Invalid Numo event ciphertext");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<StoredPayload>(value.encrypted_turn_payload);
  if (store.versionOf(cipher) !== value.encryption_version ||
      store.formatOf(cipher) !== 3) {
    throw new Error("Numo event key version mismatch");
  }
  const result = await store.decrypt(cipher, binding(expected.userId,
    expected.eventId));
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Invalid Numo event content");
  }
  auditDecryption(binding(expected.userId, expected.eventId), {
    actorId: expected.userId, reason: "repository_read",
  });
  return result;
}

export function numoTurnEventState(value: StoredPayload) {
  if (!isEncryptedNumoTurnEvent(value)) throw new Error("Clear Numo event");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value.encrypted_turn_payload);
  if (store.versionOf(cipher) !== value.encryption_version) {
    throw new Error("Numo event key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
