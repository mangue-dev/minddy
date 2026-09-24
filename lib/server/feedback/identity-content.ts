import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getBlindIndexKeys, getEncryptedStore } from
  "@/lib/server/encryption/registry";
import { blindIndex, type EncryptionScope } from "@/lib/server/encryption/store";

type Column = "email" | "name" | "external_id";
const PREFIX = "mdyf3";
const ENCODED = /^mdyf3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const SYSTEM: EncryptionScope = { kind: "system",
  id: "00000000-0000-0000-0000-000000000000" };

export function isEncryptedFeedbackIdentity(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function feedbackIdentityState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid feedback identity ciphertext");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Feedback identity key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

export async function shouldProtectFeedbackIdentity(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_FEEDBACK_IDENTITY_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await service.from("feedback_identity_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve feedback identity encryption state");
  }
  return !!data;
}

function context(projectId: string, id: string, column: Column) {
  if (!projectId || !id) throw new Error("Invalid feedback identity binding");
  return { scope: { kind: "project" as const, id: projectId },
    table: "feedback_users", column, rowId: id };
}

export async function encodeFeedbackIdentity(projectId: string, id: string,
  column: Column, value: string): Promise<string> {
  if (isEncryptedFeedbackIdentity(value)) throw new Error("Invalid feedback identity");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, context(projectId, id, column));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeFeedbackIdentity(projectId: string, id: string,
  column: Column, value: string | null, actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedFeedbackIdentity(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid feedback identity ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid feedback identity encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Feedback identity key version mismatch");
  }
  const binding = context(projectId, id, column);
  const clear = await store.decrypt(cipher, binding);
  if (typeof clear !== "string") throw new Error("Invalid feedback identity content");
  auditDecryption(binding, { actorId, reason: "repository_read" });
  return clear;
}

export async function feedbackIdentityLookup(projectId: string,
  column: "email" | "external_id", value: string): Promise<string> {
  const scope: EncryptionScope = { kind: "project", id: projectId };
  return blindFeedbackValue(scope, "feedback_users", column, value);
}

export async function feedbackOtpEmailLookup(value: string): Promise<string> {
  return blindFeedbackValue(SYSTEM, "feedback_otp_codes", "email", value);
}

export async function encodeFeedbackOtpEmail(id: string,
  value: string): Promise<string> {
  if (isEncryptedFeedbackIdentity(value)) throw new Error("Invalid feedback OTP email");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, { scope: SYSTEM,
    table: "feedback_otp_codes", column: "email", rowId: id });
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeFeedbackOtpEmail(id: string,
  value: string): Promise<string> {
  if (!isEncryptedFeedbackIdentity(value)) return value;
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid feedback OTP ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid feedback OTP encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Feedback OTP key version mismatch");
  }
  const binding = { scope: SYSTEM, table: "feedback_otp_codes",
    column: "email", rowId: id };
  const clear = await store.decrypt(cipher, binding);
  if (typeof clear !== "string") throw new Error("Invalid feedback OTP content");
  auditDecryption(binding, { actorId: null, reason: "repository_read" });
  return clear;
}

async function blindFeedbackValue(scope: EncryptionScope, table: string,
  column: string, value: string): Promise<string> {
  const current = await getBlindIndexKeys().current(scope);
  current.bytes.fill(0);
  // Equality indexes remain on version 1 until every indexed row is rebuilt.
  const key = await getBlindIndexKeys().byVersion(scope, 1);
  try {
    return blindIndex(value, { scope, table, column }, key.bytes);
  } finally { key.bytes.fill(0); }
}

export async function decodeFeedbackIdentityRow<T extends object>(
  row: T, projectId: string, actorId: string | null = null): Promise<T> {
  const fields = row as Record<string, unknown>;
  if (typeof fields.id !== "string" ||
      (fields.project_id && fields.project_id !== projectId)) {
    throw new Error("Feedback identity scope mismatch");
  }
  const decoded: Record<string, unknown> = { ...fields };
  for (const column of ["email", "name", "external_id"] as const) {
    if (typeof fields[column] === "string") {
      decoded[column] = await decodeFeedbackIdentity(projectId, fields.id,
        column, fields[column] as string, actorId);
    }
  }
  delete decoded.email_lookup;
  delete decoded.external_id_lookup;
  delete decoded.content_encryption_checked_at;
  return decoded as T;
}
