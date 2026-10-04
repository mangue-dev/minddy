import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";
import { getContentKeys } from "./registry";
import { attachmentObjectMetadata, decodeAttachmentObject,
  encodeAttachmentObject } from "./attachment-object-content";

/** Re-encode old project-key versions into verified immutable forge objects. */
export async function rotateForgeAttachmentsBatch(limit = 10, signal?: AbortSignal) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid forge attachment rotation batch size");
  }
  signal?.throwIfAborted();
  const service = getServiceClient();
  const candidates = await service.rpc("list_forge_attachment_rotation_candidates",
    { p_limit: limit });
  if (candidates.error) throw new Error("Unable to scan forge attachment rotation");
  const result = { scanned: 0, rotated: 0, unchanged: 0,
    conflicted: 0, failed: 0, orphansRemoved: 0, abandonedRemoved: 0 };
  for (const row of candidates.data ?? []) {
    signal?.throwIfAborted();
    result.scanned++;
    const path = row.storage_path as string;
    const attempted = await service.rpc("mark_forge_attachment_rotation_checked", {
      p_id: row.id, p_expected_path: path,
      p_expected_version: row.content_key_version,
    });
    if (attempted.error) { result.failed++; continue; }
    const target = `projects/${row.project_id}/forge/${row.id}/${randomUUID()}`;
    try {
      const current = await getContentKeys().current({ kind: "project", id: row.project_id });
      const version = current.version;
      current.bytes.fill(0);
      if (row.content_key_version > version) throw new Error("Forge attachment key registry regressed");
      const source = await service.storage.from(FORGE_ATTACHMENTS_BUCKET).download(path);
      if (source.error || !source.data) throw new Error("Missing forge attachment");
      const bytes = Buffer.from(await source.data.arrayBuffer());
      const clear = await decodeAttachmentObject(path, bytes);
      const sourceMetadata = attachmentObjectMetadata(bytes);
      if (sourceMetadata.content_key_version !== row.content_key_version ||
          sourceMetadata.format_version !== row.format_version) {
        throw new Error("Forge attachment object metadata differs from its reference");
      }
      if (row.content_key_version === version && row.format_version >= 4) {
        const checked = await service.rpc("verify_forge_attachment_object", {
          p_id: row.id, p_expected_path: path, p_expected_version: row.content_key_version,
          p_object_digest: createHash("sha256").update(bytes).digest("hex"),
        });
        if (checked.error) result.failed++;
        else if (checked.data !== true) result.conflicted++;
        else result.unchanged++;
        continue;
      }
      const sealed = await encodeAttachmentObject(target, clear);
      const metadata = attachmentObjectMetadata(sealed);
      if (metadata.content_key_version <= row.content_key_version ||
          metadata.format_version < 4) {
        throw new Error("Forge attachment rotation did not advance");
      }
      const uploaded = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
        .upload(target, sealed, { contentType: "application/octet-stream",
          metadata: { minddy_encrypted: "true" } });
      if (uploaded.error) throw new Error("Unable to upload rotated forge attachment");
      const verified = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
        .download(target);
      if (verified.error || !verified.data) throw new Error("Missing rotated forge attachment");
      const verifiedBytes = Buffer.from(await verified.data.arrayBuffer());
      if (!Buffer.from(await decodeAttachmentObject(target, verifiedBytes)).equals(clear)) {
        throw new Error("Rotated forge attachment verification failed");
      }
      const swapped = await service.rpc("rotate_forge_attachment_reference", {
        p_id: row.id, p_expected_path: path, p_new_path: target,
        p_expected_version: row.content_key_version,
        p_new_version: metadata.content_key_version,
      });
      if (swapped.error || !swapped.data) {
        result.conflicted++;
        continue;
      }
      const proof = await service.rpc("verify_forge_attachment_object", {
        p_id: row.id, p_expected_path: target, p_expected_version: metadata.content_key_version,
        p_object_digest: createHash("sha256").update(verifiedBytes).digest("hex"),
      });
      if (proof.error || proof.data !== true) throw new Error("Rotated forge attachment proof conflicted");
      const removed = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
        .remove([path]);
      if (removed.error) throw new Error("Unable to retire old forge attachment");
      result.rotated++;
    } catch {
      result.failed++;
    }
  }
  const orphans = await service.rpc("list_forge_attachment_orphans", { p_limit: limit });
  if (orphans.error) throw new Error("Unable to scan forge attachment orphans");
  for (const row of orphans.data ?? []) {
    signal?.throwIfAborted();
    const removed = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
      .remove([row.name]);
    if (removed.error) result.failed++;
    else result.orphansRemoved++;
  }
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const abandoned = await service.from("forge_attachment_objects")
    .select("id,storage_path").is("published_at", null)
    .eq("pending_publication_claims", 0)
    .lt("created_at", cutoff).order("created_at", { ascending: true })
    .limit(limit);
  if (abandoned.error) throw new Error("Unable to scan abandoned forge attachments");
  for (const row of abandoned.data ?? []) {
    signal?.throwIfAborted();
    const deleted = await service.rpc("delete_abandoned_forge_attachment", {
      p_id: row.id, p_expected_path: row.storage_path,
    });
    if (deleted.error) { result.failed++; continue; }
    if (!deleted.data) { result.conflicted++; continue; }
    const removed = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
      .remove([row.storage_path]);
    if (removed.error) result.failed++;
    else result.abandonedRemoved++;
  }
  return result;
}
