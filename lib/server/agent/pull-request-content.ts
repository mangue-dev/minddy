import "server-only";

import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { getServiceClient } from "@/lib/supabase-service";

export const PR_CONTENT_FIELDS = ["title", "head_branch", "base_branch"] as const;
export type PrContentField = typeof PR_CONTENT_FIELDS[number];
const PREFIX = "mdym3";
const ENCODED = /^mdym3:([1-9][0-9]*):([A-Za-z0-9_-]+)$/;
const SCOPE = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };

function binding(id: string, column: PrContentField) {
  if (!id) throw new Error("Pull request identity is required");
  return { scope: SCOPE, table: "pull_requests", column, rowId: id };
}

export function isEncryptedPullRequestContent(value: string | null): boolean {
  return typeof value === "string" && value.startsWith(`${PREFIX}:`);
}

export async function shouldEncryptPullRequestContent(): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_PULL_REQUEST_CONTENT_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await getServiceClient()
    .from("pull_request_content_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve pull request content encryption state");
  }
  return !!data;
}

export async function encodePullRequestContent(id: string, column: PrContentField,
  value: string): Promise<string> {
  if (!value || isEncryptedPullRequestContent(value)) {
    throw new Error("Invalid pull request content");
  }
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(id, column));
  return `${PREFIX}:${store.versionOf(cipher)}:${Buffer.from(cipher).toString("base64url")}`;
}

export async function decodePullRequestContent(id: string, column: PrContentField,
  value: string | null, actorId: string | null = null): Promise<string | null> {
  if (!isEncryptedPullRequestContent(value)) return value;
  const match = ENCODED.exec(value!);
  if (!match) throw new Error("Invalid encrypted pull request content");
  const serialized = Buffer.from(match[2], "base64url").toString("utf8");
  if (Buffer.from(serialized).toString("base64url") !== match[2]) {
    throw new Error("Invalid pull request content encoding");
  }
  const context = binding(id, column);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string>(serialized);
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Pull request content key version mismatch");
  }
  const plain = await store.decrypt(cipher, context);
  if (typeof plain !== "string" || !plain) {
    throw new Error("Invalid pull request content");
  }
  auditDecryption(context, { actorId, reason: "repository_read" });
  return plain;
}

export async function decodePullRequestContentRow<T extends { id: string }>(
  row: T, actorId: string | null = null): Promise<T> {
  const result: Record<string, unknown> = { ...row };
  for (const column of PR_CONTENT_FIELDS) {
    if (Object.hasOwn(row, column)) {
      result[column] = await decodePullRequestContent(row.id, column,
        (row as Record<string, unknown>)[column] as string | null, actorId);
    }
  }
  return result as T;
}

export function pullRequestContentState(value: string) {
  const match = ENCODED.exec(value);
  if (!match) throw new Error("Invalid encrypted pull request content");
  const store = getEncryptedStore();
  const cipher = store.fromDatabase(Buffer.from(match[2], "base64url").toString("utf8"));
  if (store.versionOf(cipher) !== Number(match[1])) {
    throw new Error("Pull request content key version mismatch");
  }
  return { version: store.versionOf(cipher), format: store.formatOf(cipher) };
}
