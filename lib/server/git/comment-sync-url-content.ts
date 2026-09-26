import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { auditDecryption } from "@/lib/server/encryption/audit";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

export type StoredGithubCommentUrl = {
  issue_id: string;
  remote_comment_id: string;
  html_url: string | null;
  html_url_encryption_version?: number;
};

function binding(projectId: string, issueId: string, remoteCommentId: string) {
  if (!projectId || !issueId || !remoteCommentId) {
    throw new Error("GitHub comment URL scope is required");
  }
  return { scope: { kind: "project" as const, id: projectId },
    table: "github_issue_comment_syncs", column: "html_url",
    rowId: `${issueId}:${remoteCommentId}` };
}

export function legacyGithubCommentUrlSchema(error: { code?: string } | null): boolean {
  return process.env.MINDDY_ISSUE_SIDECAR_ENCRYPTION_ENABLED !== "true" &&
    (error?.code === "42703" || error?.code === "PGRST204");
}

export async function shouldEncryptGithubCommentUrl(service: SupabaseClient,
  projectId: string) {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_ISSUE_SIDECAR_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("github_issue_comment_url_encryption_scopes")
    .select("project_id").eq("project_id", projectId).maybeSingle();
  if (error && error.code !== "42P01" && error.code !== "PGRST205") {
    throw new Error("Unable to resolve GitHub comment URL encryption state");
  }
  return !!data;
}

export async function encodeGithubCommentUrl(projectId: string, issueId: string,
  remoteCommentId: string, url: string | null) {
  const store = getEncryptedStore();
  const cipher = await store.encrypt(url, binding(projectId, issueId, remoteCommentId));
  return { html_url: cipher, html_url_encryption_version: store.versionOf(cipher) };
}

export async function decodeGithubCommentUrl<T extends StoredGithubCommentUrl>(
  projectId: string, row: T, actorId: string | null = null,
): Promise<T> {
  const version = row.html_url_encryption_version ?? 0;
  if (version === 0) {
    const { html_url_encryption_version: _version, ...safe } = row;
    return safe as T;
  }
  if (!Number.isSafeInteger(version) || version < 1 ||
      typeof row.html_url !== "string") throw new Error("Invalid encrypted GitHub comment URL");
  const context = binding(projectId, row.issue_id, row.remote_comment_id);
  const store = getEncryptedStore();
  const cipher = store.fromDatabase<string | null>(row.html_url);
  if (store.versionOf(cipher) !== version) throw new Error("GitHub comment URL key version mismatch");
  const url = await store.decrypt(cipher, context);
  if (url !== null && typeof url !== "string") throw new Error("Invalid GitHub comment URL");
  auditDecryption(context, { actorId, reason: "repository_read" });
  const { html_url_encryption_version: _version, ...safe } = row;
  return { ...safe, html_url: url } as T;
}
