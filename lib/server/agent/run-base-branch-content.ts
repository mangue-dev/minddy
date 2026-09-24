import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const PREFIX = "mdyb3";
const ENCODED = /^mdyb3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;

export type StoredAgentBaseBranch = {
  id: string;
  project_id: string;
  base_branch: string | null;
};

function binding(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Agent base branch scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "base_branch", rowId: runId };
}

function runtimeBinding(projectId: string, conversationId: string) {
  if (!projectId || !conversationId) throw new Error("Runtime base branch scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runtime_sessions", column: "base_branch", rowId: conversationId };
}

export function isEncryptedAgentBaseBranch(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptAgentBaseBranch(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_BASE_BRANCH_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_base_branch_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent base branch encryption state");
  }
  return !!data;
}

async function encode(value: string, context: ReturnType<typeof binding>): Promise<string> {
  if (!value || isEncryptedAgentBaseBranch(value)) throw new Error("Invalid agent base branch");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, context);
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

async function decode(value: string, context: ReturnType<typeof binding>,
  actorId: string | null): Promise<string> {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted agent base branch");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid base branch ciphertext encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Agent base branch key version mismatch");
  }
  const clear = await store.decrypt(cipher, context);
  if (typeof clear !== "string" || !clear) throw new Error("Invalid agent base branch content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return clear;
}

export function encryptedAgentBaseBranchState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted agent base branch");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Agent base branch key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}

export async function encodeAgentBaseBranch(projectId: string, runId: string,
  value: string | null): Promise<string | null> {
  return value === null ? null : encode(value, binding(projectId, runId));
}

export async function decodeAgentBaseBranch<T extends StoredAgentBaseBranch>(
  row: T, actorId: string | null = null): Promise<T> {
  return isEncryptedAgentBaseBranch(row.base_branch)
    ? { ...row, base_branch: await decode(row.base_branch!,
        binding(row.project_id, row.id), actorId) }
    : row;
}

export async function encodeOrphanRuntimeBaseBranch(projectId: string,
  conversationId: string, value: string): Promise<string> {
  return encode(value, runtimeBinding(projectId, conversationId));
}

export async function decodeRuntimeBaseBranch(row: { conversation_id: string;
  current_run_id: string | null; base_branch_bound_run_id?: string | null;
  base_branch: string | null }, projectId: string,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedAgentBaseBranch(row.base_branch)) return row.base_branch;
  const boundRunId = row.base_branch_bound_run_id ?? row.current_run_id;
  return decode(row.base_branch!, boundRunId
    ? binding(projectId, boundRunId)
    : runtimeBinding(projectId, row.conversation_id), actorId);
}
