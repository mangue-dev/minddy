import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { getServiceClient } from "@/lib/supabase-service";

const PREFIX = "mdyq3";
const ENCODED = /^mdyq3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function binding(id: string) {
  if (!id) throw new Error("Pull request identity is required");
  return { scope: SCOPE, table: "pull_requests", column: "url", rowId: id };
}

export function isEncryptedPullRequestUrl(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptPullRequestUrl(): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_PULL_REQUEST_URL_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await getServiceClient()
    .from("pull_request_url_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve pull request URL encryption state");
  }
  return !!data;
}

export async function encodePullRequestUrl(id: string, value: string): Promise<string> {
  if (!value || isEncryptedPullRequestUrl(value)) {
    throw new Error("Invalid pull request URL");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(id));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodePullRequestUrl(id: string, value: string | null,
  actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedPullRequestUrl(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid encrypted pull request URL");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid pull request URL ciphertext encoding");
  }
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Pull request URL key version mismatch");
  }
  const context = binding(id);
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string" || !plain) {
    throw new Error("Invalid pull request URL content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

export async function decodePullRequestUrlRow<T extends { id: string; url: string | null }>(
  row: T, actorId: string | null = null): Promise<T> {
  return { ...row, url: await decodePullRequestUrl(row.id, row.url, actorId) };
}

export function pullRequestUrlState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted pull request URL");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Pull request URL key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
