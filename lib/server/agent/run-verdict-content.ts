import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import type { AgentRunVerdict } from "./runs";

export type StoredAgentVerdict = {
  id: string;
  project_id: string;
  verdict: AgentRunVerdict | null;
  verdict_ciphertext?: string | null;
  verdict_encryption_version?: number;
};

export function legacyAgentVerdictSchema(error: { code?: string } | null): boolean {
  return process.env.MINDDY_AGENT_VERDICT_ENCRYPTION_ENABLED !== "true" &&
    (error?.code === "42703" || error?.code === "PGRST204");
}

function binding(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Agent verdict scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "verdict", rowId: runId };
}

export async function shouldEncryptAgentVerdict(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_VERDICT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_verdict_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent verdict encryption state");
  }
  return !!data;
}

function valid(value: unknown): value is AgentRunVerdict {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as AgentRunVerdict).ok === "boolean" &&
    typeof (value as AgentRunVerdict).summary === "string" &&
    Array.isArray((value as AgentRunVerdict).blockers) &&
    (value as AgentRunVerdict).blockers.every((item) => typeof item === "string");
}

export async function encodeAgentVerdict(projectId: string, runId: string,
  verdict: AgentRunVerdict | null) {
  if (verdict !== null && !valid(verdict)) throw new Error("Invalid agent verdict");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(verdict, binding(projectId, runId));
  return { verdict: null, verdict_ciphertext: cipher,
    verdict_encryption_version: store.versionOf(cipher) };
}

export async function decodeAgentVerdict<T extends StoredAgentVerdict>(
  row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.verdict_encryption_version ?? 0;
  if (version === 0) {
    if (row.verdict_ciphertext != null) throw new Error("Invalid legacy agent verdict");
    return row;
  }
  if (!Number.isSafeInteger(version) || version < 1 || row.verdict !== null ||
      typeof row.verdict_ciphertext !== "string") {
    throw new Error("Invalid encrypted agent verdict");
  }
  const context = binding(row.project_id, row.id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<AgentRunVerdict | null>(row.verdict_ciphertext);
  if (store.versionOf(cipher) !== version) throw new Error("Agent verdict key version mismatch");
  const verdict = await store.decrypt(cipher, context);
  if (verdict !== null && !valid(verdict)) throw new Error("Invalid agent verdict content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, verdict };
}
