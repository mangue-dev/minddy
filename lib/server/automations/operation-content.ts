import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type OperationField = "prompt" | "context" | "outcome_summary" |
  "outcome_blockers";
const PREFIX = "mdyo3";
const ENCODED = /^mdyo3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const WRAPPER = ["encrypted_operation_value", "encryption_version",
  "project_id", "chain_id", "step", "field"];

type JsonValue = Record<string, unknown> | unknown[];
type StoredJson = JsonValue & { encrypted_operation_value?: unknown };

function binding(projectId: string, chainId: string, step: number,
  field: OperationField) {
  if (!projectId || !chainId || !Number.isSafeInteger(step) || step < 1) {
    throw new Error("Automation operation identity is required");
  }
  return { scope: { kind: "project" as const, id: projectId },
    table: "numo_automation_operations", column: field,
    rowId: JSON.stringify([chainId, step]) };
}

export function isEncryptedOperationText(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export function isEncryptedOperationJson(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.hasOwn(value, "encrypted_operation_value");
}

export async function shouldProtectAutomationOperation(
  service: SupabaseClient = getServiceClient()): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_NUMO_AUTOMATION_ENCRYPTION_ENABLED === "true") return true;
  const { data, error } = await service.from("numo_automation_content_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve automation operation encryption state");
  }
  return !!data;
}

export async function encodeOperationText(projectId: string, chainId: string,
  step: number, field: "prompt" | "outcome_summary", value: string | null):
  Promise<string | null> {
  if (value === null) return null;
  if (typeof value !== "string" || isEncryptedOperationText(value)) {
    throw new Error("Invalid automation operation text");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(projectId, chainId, step, field));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeOperationText(projectId: string, chainId: string,
  step: number, field: "prompt" | "outcome_summary", value: string | null,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedOperationText(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid automation operation ciphertext");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid automation operation encoding");
  }
  const context = binding(projectId, chainId, step, field);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1]) ||
      store.formatOf(cipher) !== 3) {
    throw new Error("Automation operation key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (typeof decoded !== "string") throw new Error("Invalid automation operation text");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}

export async function encodeOperationJson(projectId: string, chainId: string,
  step: number, field: "context" | "outcome_blockers", value: JsonValue):
  Promise<Record<string, unknown>> {
  if (!value || typeof value !== "object" || isEncryptedOperationJson(value)) {
    throw new Error("Invalid automation operation JSON");
  }
  if (field === "context" ? Array.isArray(value) : !Array.isArray(value)) {
    throw new Error("Invalid automation operation JSON shape");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(projectId, chainId, step, field));
  return { encrypted_operation_value: cipher,
    encryption_version: store.versionOf(cipher), project_id: projectId,
    chain_id: chainId, step, field };
}

export async function decodeOperationJson(projectId: string, chainId: string,
  step: number, field: "context" | "outcome_blockers", value: StoredJson,
  actorId: string | null = null): Promise<JsonValue> {
  if (!isEncryptedOperationJson(value)) return value;
  if (Object.keys(value).length !== WRAPPER.length ||
      WRAPPER.some((key) => !Object.hasOwn(value, key)) ||
      typeof value.encrypted_operation_value !== "string" ||
      !Number.isSafeInteger(value.encryption_version) ||
      (value.encryption_version as number) < 1 ||
      value.project_id !== projectId || value.chain_id !== chainId ||
      value.step !== step || value.field !== field) {
    throw new Error("Invalid automation operation JSON ciphertext");
  }
  const context = binding(projectId, chainId, step, field);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<JsonValue>(value.encrypted_operation_value);
  if (store.versionOf(cipher) !== value.encryption_version ||
      store.formatOf(cipher) !== 3) {
    throw new Error("Automation operation key version mismatch");
  }
  const decoded = await store.decrypt(cipher, context);
  if (!decoded || typeof decoded !== "object" ||
      (field === "context" ? Array.isArray(decoded) : !Array.isArray(decoded))) {
    throw new Error("Invalid automation operation JSON content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return decoded;
}

export function operationTextState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Clear automation operation text");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Automation operation text key mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

export function operationJsonState(value: Record<string, unknown>) {
  if (!isEncryptedOperationJson(value) ||
      typeof value.encrypted_operation_value !== "string") {
    throw new Error("Clear automation operation JSON");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(value.encrypted_operation_value);
  if (store.versionOf(cipher) !== value.encryption_version) {
    throw new Error("Automation operation JSON key mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
