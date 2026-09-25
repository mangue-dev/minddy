import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const PREFIX = "mdyn3";
const ENCODED = /^mdyn3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;

function binding(userId: string, conversationId: string) {
  if (!userId || !conversationId) throw new Error("Numo conversation identity is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "conversations", column: "title", rowId: conversationId };
}

export function isEncryptedConversationTitle(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldProtectConversationTitle(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_NUMO_CONVERSATION_TITLE_ENCRYPTION_ENABLED === "true") {
    return true;
  }
  const { data, error } = await service.from("numo_conversation_title_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve Numo conversation title encryption state");
  }
  return !!data;
}

export async function encodeConversationTitle(userId: string,
  conversationId: string, value: string | null): Promise<string | null> {
  if (value === null) return null;
  if (typeof value !== "string" || isEncryptedConversationTitle(value)) {
    throw new Error("Invalid Numo conversation title");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(userId, conversationId));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeConversationTitle(userId: string,
  conversationId: string, value: string | null,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedConversationTitle(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid Numo conversation ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid Numo conversation encoding");
  }
  const context = binding(userId, conversationId);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1]) ||
      store.formatOf(cipher) !== 3) {
    throw new Error("Numo conversation key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (typeof decoded !== "string") {
    throw new Error("Invalid Numo conversation title content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}

export function conversationTitleState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Clear Numo conversation title");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Numo conversation title version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
