import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getBlindIndexKeys, getEncryptedStore } from "@/lib/server/encryption/registry";
import { blindIndex } from "@/lib/server/encryption/store";

const SYSTEM_SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };
const INDEX_CONTEXT = { scope: SYSTEM_SCOPE, table: "agent_runs",
  column: "branch_name" };
const ENCODED = /^mdyw3:([a-f0-9]{64}):([1-9][0-9]*):([A-Za-z0-9_-]+)$/;

export type StoredAgentWorkBranch = { id: string; project_id: string;
  branch_name: string | null };

function runBinding(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Agent work branch scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "branch_name", rowId: runId };
}

function artifactBinding(projectId: string, artifactId: string) {
  if (!projectId || !artifactId) throw new Error("Agent artifact scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_artifacts", column: "ref", rowId: artifactId };
}

function runtimeBinding(projectId: string, conversationId: string) {
  if (!projectId || !conversationId) throw new Error("Agent runtime scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runtime_sessions", column: "work_branch", rowId: conversationId };
}

async function digest(value: string): Promise<string> {
  const key = await getBlindIndexKeys().current(SYSTEM_SCOPE);
  try { return blindIndex(value, INDEX_CONTEXT, key.bytes); }
  finally { key.bytes.fill(0); }
}

export async function workBranchLookupPrefix(value: string): Promise<string> {
  return `mdyw3:${await digest(value)}:`;
}

export function isEncryptedWorkBranch(value: string | null): boolean {
  return typeof value === "string" && value.startsWith("mdyw3:");
}

export function workBranchArtifactRef(value: string): string {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted work branch");
  return `mdyw3:${match[1]}`;
}

export async function shouldEncryptAgentWorkBranch(service: SupabaseClient,
  projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_WORK_BRANCH_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_work_branch_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent work branch encryption state");
  }
  return !!data;
}

async function encode(value: string, context: ReturnType<typeof runBinding>): Promise<string> {
  if (isEncryptedWorkBranch(value)) throw new Error("Invalid work branch");
  const store = getEncryptedStore();
  const [cipher, index] = await Promise.all([
    store.encrypt(value, context), digest(value),
  ]);
  return `mdyw3:${index}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function encodeAgentWorkBranch(projectId: string, runId: string,
  value: string | null): Promise<string | null> {
  return value === null ? null : encode(value, runBinding(projectId, runId));
}

export async function encodeOrphanArtifactBranch(projectId: string,
  artifactId: string, value: string): Promise<string> {
  return encode(value, artifactBinding(projectId, artifactId));
}

export async function encodeOrphanRuntimeWorkBranch(projectId: string,
  conversationId: string, value: string): Promise<string> {
  return encode(value, runtimeBinding(projectId, conversationId));
}

export async function decodeWorkBranchValue(projectId: string, boundRunId: string | null,
  artifactId: string | null, value: string, actorId: string | null = null,
  runtimeConversationId: string | null = null): Promise<string> {
  if (!isEncryptedWorkBranch(value)) return value;
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted work branch");
  const serialized = Buffer.from(match[3], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[3]) {
    throw new Error("Invalid work branch ciphertext encoding");
  }
  const context = boundRunId
    ? runBinding(projectId, boundRunId)
    : runtimeConversationId
      ? runtimeBinding(projectId, runtimeConversationId)
      : artifactBinding(projectId, artifactId ?? "");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[2])) {
    throw new Error("Agent work branch key version mismatch");
  }
  const clear = await store.decrypt(cipher, context);
  if (typeof clear !== "string" || await digest(clear) !== match[1]) {
    throw new Error("Invalid encrypted work branch content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return clear;
}

export async function decodeAgentWorkBranch<T extends StoredAgentWorkBranch>(row: T,
  actorId: string | null = null): Promise<T> {
  return isEncryptedWorkBranch(row.branch_name)
    ? { ...row, branch_name: await decodeWorkBranchValue(row.project_id,
        row.id, null, row.branch_name!, actorId) }
    : row;
}

export async function decodeRuntimeWorkBranch(row: { conversation_id: string;
  current_run_id: string | null; work_branch_bound_run_id?: string | null;
  work_branch: string | null }, projectId: string,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedWorkBranch(row.work_branch)) return row.work_branch;
  const boundRunId = row.work_branch_bound_run_id ?? row.current_run_id;
  return decodeWorkBranchValue(projectId, boundRunId, null,
    row.work_branch!, actorId, row.conversation_id);
}

export function encryptedWorkBranchState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted work branch");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[3], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[2])) {
    throw new Error("Agent work branch key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
