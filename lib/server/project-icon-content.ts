import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedObjectCodec } from "./encryption/object-codec";
import type { DecryptAudit } from "./encryption/audit";
import { getEncryptedStore } from "./encryption/registry";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { ICON_MIME_EXT } from "./favicon";

const BUCKET = "project-icons";
const PATH = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.enc$/;

export function projectIconRoute(projectId: string, version = Date.now()): string {
  return `/api/projects/${projectId}/icon/content?v=${version}`;
}

export function publicProjectIconRoute(
  url: string | null,
  token: string,
  kind: "feedback" | "share",
): string | null {
  if (!url?.startsWith("/api/projects/")) return url;
  return `${url}&share_token=${encodeURIComponent(token)}&share_kind=${kind}`;
}

export async function shouldProtectProjectIcons(
  service: SupabaseClient = getServiceClient(),
): Promise<boolean> {
  if (isContentEncryptionEnabled() &&
      process.env.MINDDY_PROJECT_ICON_ENCRYPTION_ENABLED === "true") return true;
  if (!process.env.MINDDY_DATA_ROOT_KEY) return false;
  const { data, error } = await service.from("project_icon_encryption_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code)) {
    throw new Error("Unable to resolve project icon protection state");
  }
  return !!data;
}

function context(projectId: string, path: string) {
  if (PATH.exec(path)?.[1] !== projectId) {
    throw new Error("Invalid project icon object path");
  }
  return { scope: { kind: "project" as const, id: projectId },
    bucket: BUCKET, path };
}

export async function uploadProtectedProjectIcon(
  service: SupabaseClient,
  projectId: string,
  bytes: Buffer,
  mimeType: string,
): Promise<string> {
  const path = `${projectId}/${randomUUID()}.enc`;
  const codec = new EncryptedObjectCodec(getEncryptedStore());
  const encrypted = await codec.encode(bytes, context(projectId, path), {
    fileName: "project-icon", mimeType,
  });
  const { error } = await service.storage.from(BUCKET).upload(path, encrypted, {
    contentType: "application/octet-stream", upsert: false,
  });
  if (error) throw new Error(error.message);
  try {
    const verified = await downloadProtectedProjectIcon(service, projectId, path);
    if (!verified.bytes.equals(bytes) || verified.mimeType !== mimeType) {
      throw new Error("Project icon verification failed");
    }
    const marked = await service.from("project_icon_encrypted_objects")
      .insert({ path, project_id: projectId });
    if (marked.error) throw new Error("Unable to register encrypted project icon");
    return path;
  } catch (error) {
    await service.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

export async function downloadProtectedProjectIcon(
  service: SupabaseClient,
  projectId: string,
  path: string,
  audit: DecryptAudit = { actorId: null, reason: "repository_read" },
): Promise<{ bytes: Buffer; mimeType: string }> {
  const input = context(projectId, path);
  const { data, error } = await service.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Unable to download project icon");
  const codec = new EncryptedObjectCodec(getEncryptedStore());
  const result = await codec.decode(
    codec.fromStorage(Buffer.from(await data.arrayBuffer())), input, audit,
  );
  if (!ICON_MIME_EXT[result.metadata.mimeType]) {
    throw new Error("Unsupported protected project icon type");
  }
  return { bytes: result.bytes, mimeType: result.metadata.mimeType };
}

export async function removeProtectedProjectIcon(
  service: SupabaseClient,
  path: string,
): Promise<void> {
  const removed = await service.storage.from(BUCKET).remove([path]);
  if (removed.error) throw new Error("Unable to remove project icon object");
  const unmarked = await service.from("project_icon_encrypted_objects")
    .delete().eq("path", path);
  if (unmarked.error) throw new Error("Unable to unregister project icon object");
}
