import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type StoredTurnIntent = Record<string, unknown>;
type BoundTurnIntent = StoredTurnIntent & {
  encrypted_intent: string;
  encryption_version: number;
  user_id: string;
  conversation_id: string;
  request_id: string;
};
const KEYS = ["encrypted_intent", "encryption_version", "user_id",
  "conversation_id", "request_id"];

function binding(userId: string, conversationId: string, requestId: string) {
  if (!userId || !conversationId || !requestId) {
    throw new Error("Numo turn intent binding is required");
  }
  return { scope: { kind: "user" as const, id: userId },
    table: "numo_assistant_turns", column: "intent",
    rowId: JSON.stringify([conversationId, requestId]) };
}

export function isEncryptedTurnIntent(value: StoredTurnIntent):
  value is BoundTurnIntent {
  return Object.hasOwn(value, "encrypted_intent");
}

export async function shouldProtectNumoTurnIntent(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled()) return true;
  const { data, error } = await service.from("numo_turn_intent_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve Numo turn intent encryption state");
  }
  return !!data;
}

export async function encodeNumoTurnIntent(userId: string,
  conversationId: string, requestId: string, value: StoredTurnIntent):
  Promise<BoundTurnIntent> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      isEncryptedTurnIntent(value)) throw new Error("Invalid Numo turn intent");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(userId, conversationId, requestId));
  return { encrypted_intent: cipher, encryption_version: store.versionOf(cipher),
    user_id: userId, conversation_id: conversationId, request_id: requestId };
}

export async function decodeNumoTurnIntent(value: StoredTurnIntent,
  expected: { userId: string; conversationId: string; requestId: string },
  actorId: string | null = null): Promise<StoredTurnIntent> {
  if (!isEncryptedTurnIntent(value)) return value;
  if (Object.keys(value).length !== KEYS.length ||
      KEYS.some((key) => !Object.hasOwn(value, key)) ||
      typeof value.encrypted_intent !== "string" ||
      !Number.isSafeInteger(value.encryption_version) ||
      value.encryption_version < 1 || value.user_id !== expected.userId ||
      value.conversation_id !== expected.conversationId ||
      value.request_id !== expected.requestId) {
    throw new Error("Invalid Numo turn intent ciphertext");
  }
  const context = binding(expected.userId, expected.conversationId,
    expected.requestId);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<StoredTurnIntent>(value.encrypted_intent);
  if (store.versionOf(cipher) !== value.encryption_version ||
      store.formatOf(cipher) !== 3) {
    throw new Error("Numo turn intent key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded) ||
      isEncryptedTurnIntent(decoded)) throw new Error("Invalid Numo turn intent");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}

export function numoTurnIntentState(value: StoredTurnIntent) {
  if (!isEncryptedTurnIntent(value)) throw new Error("Clear Numo turn intent");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value.encrypted_intent);
  if (store.versionOf(cipher) !== value.encryption_version) {
    throw new Error("Numo turn intent key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
