import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { getServiceClient } from "@/lib/supabase-service";

const PREFIX = "mdye3";
const ENCODED = /^mdye3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function binding(id: string) {
  if (!id) throw new Error("PR comment edit identity is required");
  return { scope: SCOPE, table: "pr_comment_edits", column: "body", rowId: id };
}

export function isEncryptedPrCommentEdit(value: string): boolean {
  return value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptPrCommentEdit(): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_PR_COMMENT_EDIT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await getServiceClient()
    .from("pr_comment_edit_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve PR comment edit encryption state");
  }
  return !!data;
}

export async function encodePrCommentEdit(id: string, value: string): Promise<string> {
  if (isEncryptedPrCommentEdit(value)) throw new Error("Invalid PR comment edit");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(id));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodePrCommentEdit(id: string, value: string,
  actorId: string | null = null): Promise<string> {
  if (!isEncryptedPrCommentEdit(value)) return value;
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted PR comment edit");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid PR comment edit ciphertext encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("PR comment edit key version mismatch");
  }
  const context = binding(id);
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string") throw new Error("Invalid PR comment edit content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

export function prCommentEditState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted PR comment edit");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("PR comment edit key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
