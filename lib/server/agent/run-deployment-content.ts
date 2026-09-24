import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getBlindIndexKeys, getEncryptedStore } from "@/lib/server/encryption/registry";
import { blindIndex } from "@/lib/server/encryption/store";

const SYSTEM_SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };
const INDEX_CONTEXT = { scope: SYSTEM_SCOPE, table: "agent_runs",
  column: "deployment_url" };
const PREFIX = "mdye3";
const ENCODED = /^mdye3:([a-f0-9]{64}):([1-9][0-9]*):([A-Za-z0-9_-]+)$/;

export type StoredAgentDeployment = { id: string; project_id: string;
  deployment_url: string | null };

function binding(projectId: string, runId: string) {
  if (!projectId || !runId) throw new Error("Agent deployment scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "agent_runs", column: "deployment_url", rowId: runId };
}

async function indexFor(url: string): Promise<string> {
  const key = await getBlindIndexKeys().current(SYSTEM_SCOPE);
  try { return blindIndex(url, INDEX_CONTEXT, key.bytes); }
  finally { key.bytes.fill(0); }
}

export async function deploymentLookupPrefix(url: string): Promise<string> {
  if (!url) throw new Error("Deployment URL is required");
  return `${PREFIX}:${await indexFor(url)}:`;
}

export function isEncryptedDeploymentUrl(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptAgentDeployment(service: SupabaseClient, projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_AGENT_DEPLOYMENT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("agent_deployment_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve agent deployment encryption state");
  }
  return !!data;
}

export async function encodeAgentDeploymentUrl(projectId: string, runId: string,
  url: string): Promise<string> {
  if (!url || isEncryptedDeploymentUrl(url)) throw new Error("Invalid deployment URL");
  const store = getEncryptedStore();
  const [cipher, index] = await Promise.all([
    store.encrypt(url, binding(projectId, runId)), indexFor(url),
  ]);
  return `${PREFIX}:${index}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodeAgentDeploymentUrl<T extends StoredAgentDeployment>(
  row: T, actorId: string | null = null,
): Promise<T> {
  const encoded = row.deployment_url;
  if (!isEncryptedDeploymentUrl(encoded)) return row;
  const match = ENCODED.exec(encoded!);
  if (!match) throw new Error("Invalid encrypted deployment URL");
  const serialized = Buffer.from(match[3], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[3]) {
    throw new Error("Invalid deployment ciphertext encoding");
  }
  const context = binding(row.project_id, row.id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[2])) {
    throw new Error("Agent deployment key version mismatch");
  }
  const url = await store.decrypt(cipher, context);
  if (typeof url !== "string" || !url || await indexFor(url) !== match[1]) {
    throw new Error("Invalid encrypted deployment URL content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return { ...row, deployment_url: url };
}

export function encryptedDeploymentState(value: string): { version: number; format: number } {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted deployment URL");
  const serialized = Buffer.from(match[3], "base64url").toString("utf8");
  const version = Number(match[2]);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(serialized);
  if (store.versionOf(cipher) !== version) {
    throw new Error("Agent deployment key version mismatch");
  }
  return { version, format: store.formatOf(cipher) };
}
