import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const PREFIX = "mdys3";
const ENCODED = /^mdys3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
export type SummaryField = "outcome" | "error_message";
export type StoredRunSummary = { id: string; project_id: string;
  outcome?: string | null; error_message?: string | null };

function binding(projectId: string, runId: string, field: SummaryField) {
  if (!projectId || !runId) throw new Error("Run summary scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: field, rowId: runId };
}

function turnBinding(projectId: string, turnId: string, runId: string | null,
  field: SummaryField) {
  if (runId) return binding(projectId, runId, field);
  if (!projectId || !turnId) throw new Error("Archived turn scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_turns", column: field, rowId: turnId };
}

export function isEncryptedRunSummary(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptAgentSummary(service: SupabaseClient,
  projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_SUMMARY_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_summary_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent summary encryption state");
  }
  return !!data;
}

export async function encodeRunSummary(projectId: string, runId: string,
  field: SummaryField, value: string | null): Promise<string | null> {
  if (value === null) return null;
  if (typeof value !== "string" || isEncryptedRunSummary(value)) {
    throw new Error("Invalid run summary");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(projectId, runId, field));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeRunSummaryValue(projectId: string, runId: string,
  field: SummaryField, value: string | null,
  actorId: string | null = null): Promise<string | null> {
  return decodeSummaryValue(binding(projectId, runId, field), value, actorId);
}

async function decodeSummaryValue(context: ReturnType<typeof binding>,
  value: string | null, actorId: string | null): Promise<string | null> {
  if (!isEncryptedRunSummary(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid encrypted run summary");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid run summary ciphertext encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Run summary key version mismatch");
  }
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string") throw new Error("Invalid run summary content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

export async function encodeTurnSummary(projectId: string, turnId: string,
  runId: string | null, field: SummaryField, value: string | null) {
  if (value === null) return null;
  if (typeof value !== "string" || isEncryptedRunSummary(value)) {
    throw new Error("Invalid turn summary");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, turnBinding(projectId, turnId, runId, field));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeTurnSummaryValue(projectId: string, turnId: string,
  runId: string | null, field: SummaryField, value: string | null,
  actorId: string | null = null) {
  return decodeSummaryValue(turnBinding(projectId, turnId, runId, field), value, actorId);
}

export async function decodeRunSummary<T extends StoredRunSummary>(row: T,
  actorId: string | null = null): Promise<T> {
  const [outcome, error] = await Promise.all([
    decodeRunSummaryValue(row.project_id, row.id, "outcome", row.outcome ?? null, actorId),
    decodeRunSummaryValue(row.project_id, row.id, "error_message",
      row.error_message ?? null, actorId),
  ]);
  return { ...row, outcome, error_message: error };
}

export function encryptedRunSummaryState(value: string): { version: number; format: number } {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted run summary");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  const cipher = getEncryptedStore().fromDatabase(serialized);
  if (getEncryptedStore().versionOf(cipher) !== Number(match[1])) {
    throw new Error("Run summary key version mismatch");
  }
  return { version: Number(match[1]), format: getEncryptedStore().formatOf(cipher) };
}
