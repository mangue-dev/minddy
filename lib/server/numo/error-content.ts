import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const PREFIX = "mdye3";
const ENCODED = /^mdye3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
export type NumoErrorSource = "numo_assistant_turns" | "conversations"
  | "numo_routine_occurrences";

function binding(userId: string, source: NumoErrorSource, rowId: string) {
  if (!userId || !rowId) throw new Error("Numo error scope is required");
  return { scope: { kind: "user" as const, id: userId }, table: source,
    column: "error_message", rowId };
}

export async function shouldProtectNumoErrors(service: SupabaseClient) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_NUMO_ERROR_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await service.from("numo_error_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve Numo error encryption state");
  }
  return !!data;
}

export async function encodeNumoError(userId: string, source: NumoErrorSource,
  rowId: string, value: string | null): Promise<string | null> {
  if (value === null) return null;
  if (typeof value !== "string" || value.startsWith(`${PREFIX}:`)) {
    throw new Error("Invalid Numo error message");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(userId, source, rowId));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export function isEncryptedNumoError(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function numoErrorState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Clear Numo error message");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid Numo error encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Numo error key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

export async function decodeNumoError(userId: string, source: NumoErrorSource,
  rowId: string, value: string | null,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedNumoError(value)) return value;
  const state = numoErrorState(value!);
  if (state.format !== 3) throw new Error("Invalid Numo error format");
  const serialized = Buffer.from(ENCODED.exec(value!)![2], "base64url").toString("utf8");
  const context = binding(userId, source, rowId);
  const decoded = await getEncryptedStore().decrypt(
    getEncryptedStore().fromDatabase<string>(serialized), context);
  if (typeof decoded !== "string") throw new Error("Invalid Numo error payload");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}
