import "server-only";

import { NextResponse } from "next/server";
import { MAX_ATTACHMENT_UPLOAD_BYTES } from "@/lib/attachment-upload-limits";
import { FORGE_ATTACHMENTS_BUCKET, forgeAttachmentProxyUrl } from "@/lib/forge-image-assets";
import { resolveUploadedMimeType, servedMimeType } from "@/lib/inline-safe";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { attachmentObjectMetadata, decodeAttachmentObject,
  encodeAttachmentObject } from "@/lib/server/encryption/attachment-object-content";
import { getServiceClient } from "@/lib/supabase-service";
import { requireActor } from "./pr-access";
import type { PrScope } from "./pr-scope";

/** Restrict the type served by the capability proxy to the inline allowlist. */
const servedAttachmentType = servedMimeType;

/**
 * The file of a multipart body, or `null`.
 *
 * Shared by both PR attachment routes — the one indexed by PR and
 * its per-run facade. Reading the body loads it fully into memory, so it must
 * happen only after authorization (MIN-348). Keeping this ordering guard in one
 * helper prevents the two routes from diverging.
 */
export async function readUploadedFile(request: Request): Promise<File | null> {
  try {
    const entry = (await request.formData()).get("file");
    return entry instanceof File ? entry : null;
  } catch {
    return null;
  }
}

/**
 * Stores encrypted bytes under an opaque key and returns a durable capability
 * URL for readers of the published forge comment. Upload requires PR read access.
 */
export async function prAttachmentResponse(
  scope: PrScope,
  file: File,
): Promise<NextResponse> {
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;

  if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const name = (file.name || "fichier").slice(-200);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The bytes first, the declared type second: a `.png` holding HTML is
  // caught before the allowlist (MIN-340).
  const contentType = servedAttachmentType(resolveUploadedMimeType(file.type, bytes));
  const id = crypto.randomUUID();
  const service = getServiceClient();
  const link = await service.from("project_git_links")
    .select("project_id").eq("id", scope.target.linkId).single();
  if (link.error || !link.data?.project_id) {
    return NextResponse.json({ error: "Upload unavailable" }, { status: 503 });
  }
  const projectId = link.data.project_id;
  const path = `projects/${projectId}/forge/${id}/${crypto.randomUUID()}`;
  const stored = await encodeAttachmentObject(path, bytes);
  const activated = await service.rpc("activate_forge_attachment_encryption");
  if (activated.error || activated.data !== true) {
    return NextResponse.json({ error: "Upload unavailable" }, { status: 503 });
  }
  const { error } = await service.storage
    .from(FORGE_ATTACHMENTS_BUCKET)
    .upload(path, stored, { contentType: "application/octet-stream",
      metadata: { minddy_encrypted: "true" } });
  if (error) {
    console.error("[pr-actions] forge_attachment_upload_failed");
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  try {
    const downloaded = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
      .download(path);
    if (downloaded.error || !downloaded.data ||
        !Buffer.from(await decodeAttachmentObject(path,
          Buffer.from(await downloaded.data.arrayBuffer()))).equals(Buffer.from(bytes))) {
      throw new Error("Forge attachment verification failed");
    }
    const registered = await service.from("forge_attachment_objects").insert({
      id, pr_id: scope.pr.id, project_id: projectId,
      storage_path: path,
      ...attachmentObjectMetadata(stored),
    });
    if (registered.error) throw new Error("Forge attachment registration failed");
  } catch {
    await service.storage.from(FORGE_ATTACHMENTS_BUCKET).remove([path]);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  return NextResponse.json({
    url: forgeAttachmentProxyUrl(canonicalAppOrigin(), id),
    name,
    // The composer picks the markdown from it: `![](…)` for an image, a named
    // link otherwise. The served type decides, not the declared one, or a
    // file served as octet-stream would become a dead image.
    isImage: contentType.startsWith("image/"),
  });
}

export async function withForgeAttachmentPublication<T>(prId: string, body: string,
  publish: () => Promise<T>): Promise<T> {
  const ids = [...new Set([...body.matchAll(/\/api\/pr-attachments\/([0-9a-f-]{36})(?![\w/-])/gi)]
    .map((match) => match[1]))];
  if (!ids.length) return publish();
  const service = getServiceClient();
  const reserved = await service.rpc("reserve_forge_attachment_publications",
    { p_pr_id: prId, p_ids: ids });
  if (reserved.error || reserved.data !== ids.length) {
    throw new Error("Unable to reserve forge attachment publication");
  }
  let published: T;
  try {
    published = await publish();
  } catch (error) {
    await service.rpc("finish_forge_attachment_publications",
      { p_pr_id: prId, p_ids: ids, p_published: false });
    throw error;
  }
  const finished = await service.rpc("finish_forge_attachment_publications",
    { p_pr_id: prId, p_ids: ids, p_published: true });
  if (finished.error || finished.data !== ids.length) {
    // A claim remains after an ambiguous finalization, so cleanup cannot remove
    // bytes that the forge may already reference.
    console.error("[pr-actions] forge attachment publication claim pending");
  }
  return published;
}
