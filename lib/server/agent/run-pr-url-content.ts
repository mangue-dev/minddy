import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

const PREFIX = "mdyp3";
const ENCODED = /^mdyp3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
export type StoredAgentPrUrl = { id: string; project_id: string;
  pr_url: string | null };

function binding(projectId: string, runId: string | null, artifactId: string | null) {
  if (!projectId || (!runId && !artifactId)) throw new Error("Agent PR URL scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: runId ? "agent_runs" : "agent_artifacts", column: runId ? "pr_url" : "url",
    rowId: (runId ?? artifactId)! };
}

export function isEncryptedAgentPrUrl(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptAgentPrUrl(service: SupabaseClient,
  projectId: string): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_PR_URL_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_pr_url_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent PR URL encryption state");
  }
  return !!data;
}

async function encode(projectId: string, runId: string | null,
  artifactId: string | null, value: string): Promise<string> {
  if (!value || isEncryptedAgentPrUrl(value)) throw new Error("Invalid agent PR URL");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(projectId, runId, artifactId));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function encodeAgentPrUrl(projectId: string, runId: string,
  value: string | null): Promise<string | null> {
  return value === null ? null : encode(projectId, runId, null, value);
}

export async function encodeOrphanArtifactUrl(projectId: string, artifactId: string,
  value: string): Promise<string> {
  return encode(projectId, null, artifactId, value);
}

export async function decodeAgentPrUrlValue(projectId: string, runId: string | null,
  artifactId: string | null, value: string | null,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedAgentPrUrl(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid encrypted agent PR URL");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid agent PR URL ciphertext encoding");
  }
  const context = binding(projectId, runId, artifactId);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Agent PR URL key version mismatch");
  }
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string" || !plain) throw new Error("Invalid agent PR URL content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

export async function decodeAgentPrUrl<T extends StoredAgentPrUrl>(row: T,
  actorId: string | null = null): Promise<T> {
  return { ...row, pr_url: await decodeAgentPrUrlValue(row.project_id, row.id,
    null, row.pr_url, actorId) };
}

export function agentPrUrlState(value: string): { version: number; format: number } {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted agent PR URL");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Agent PR URL key version mismatch");
  }
  return { version: Number(match[1]), format: store.formatOf(cipher) };
}
