import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { shouldProtectConversationTitle } from "./conversation-title-content";

/**
 * The summary that replaces the compacted start of a Numo conversation
 * (MIN-954), stored on `conversations.context_summary`. It is written from
 * the conversation's own messages, so it is protected exactly like the
 * conversation's title: same scope, same encryption switch.
 */

const PREFIX = "mdys3";
const ENCODED = /^mdys3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;

function binding(userId: string, conversationId: string) {
  if (!userId || !conversationId) throw new Error("Numo conversation identity is required");
  return { scope: { kind: "user" as const, id: userId },
    table: "conversations", column: "context_summary", rowId: conversationId };
}

export function isEncryptedContextSummary(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function shouldProtectContextSummary(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  return shouldProtectConversationTitle(service);
}

export async function encodeContextSummary(userId: string,
  conversationId: string, value: string): Promise<string> {
  if (typeof value !== "string" || !value || isEncryptedContextSummary(value)) {
    throw new Error("Invalid Numo context summary");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(userId, conversationId));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeContextSummary(userId: string,
  conversationId: string, value: string | null): Promise<string | null> {
  if (!isEncryptedContextSummary(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid Numo context summary ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid Numo context summary encoding");
  }
  const context = binding(userId, conversationId);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1]) || store.formatOf(cipher) !== 3) {
    throw new Error("Numo context summary key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (typeof decoded !== "string") throw new Error("Invalid Numo context summary content");
  auditDecryption(context, { actorId: userId, reason: "repository_read" });
  return decoded;
}
