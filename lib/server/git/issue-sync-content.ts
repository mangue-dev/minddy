import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type StoredGithubIssueMetadata = {
  issue_id: string;
  metadata: Record<string, unknown>;
  milestone: unknown | null;
  content_ciphertext?: string | null;
  content_encryption_version?: number;
};

function binding(projectId: string, issueId: string) {
  if (!projectId || !issueId) throw new Error("GitHub issue metadata scope is required");
  return { scope: { kind: "project" as const, id: projectId },
    table: "github_issue_sync_metadata", column: "content", rowId: issueId };
}

export function legacyGithubIssueMetadataSchema(error: { code?: string } | null): boolean {
  return process.env.MINDDY_ISSUE_SIDECAR_ENCRYPTION_ENABLED !== "true" &&
    (error?.code === "42703" || error?.code === "PGRST204");
}

export async function shouldEncryptGithubIssueMetadata(service: SupabaseClient,
  projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_ISSUE_SIDECAR_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("github_issue_metadata_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve GitHub issue metadata encryption state");
  }
  return !!data;
}

export async function encodeGithubIssueMetadata(projectId: string, issueId: string,
  value: Pick<StoredGithubIssueMetadata, "metadata" | "milestone">) {
  if (!value.metadata || typeof value.metadata !== "object" ||
      Array.isArray(value.metadata)) throw new Error("Invalid GitHub issue metadata");
  const store = getEncryptedStore();
  const cipher = await store.encrypt(value, binding(projectId, issueId));
  return { metadata: {} as Record<string, unknown>, milestone: null,
    content_ciphertext: cipher, content_encryption_version: store.versionOf(cipher) };
}

export async function decodeGithubIssueMetadata<T extends StoredGithubIssueMetadata>(
  projectId: string, row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.content_encryption_version ?? 0;
  if (version === 0) {
    if (row.content_ciphertext != null) throw new Error("Invalid legacy GitHub issue metadata");
    const { content_ciphertext: _cipher, content_encryption_version: _version,
      ...safe } = row;
    return safe as T;
  }
  if (!Number.isSafeInteger(version) || version < 1 ||
      Object.keys(row.metadata ?? {}).length !== 0 || row.milestone !== null ||
      typeof row.content_ciphertext !== "string") {
    throw new Error("Invalid encrypted GitHub issue metadata");
  }
  const context = binding(projectId, row.issue_id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<Pick<StoredGithubIssueMetadata,
    "metadata" | "milestone">>(row.content_ciphertext);
  if (store.versionOf(cipher) !== version) throw new Error("GitHub issue metadata key version mismatch");
  const value = await store.decrypt(cipher, context);
  if (!value || !value.metadata || typeof value.metadata !== "object" ||
      Array.isArray(value.metadata)) throw new Error("Invalid GitHub issue metadata content");
  auditDecryption(context, { actorId, reason: "repository_read" });
  const { content_ciphertext: _cipher, content_encryption_version: _version,
    ...safe } = row;
  return { ...safe, metadata: value.metadata, milestone: value.milestone } as T;
}
