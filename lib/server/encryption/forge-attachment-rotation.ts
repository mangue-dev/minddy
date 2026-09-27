import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";
import { getContentKeys } from "./registry";
import { attachmentObjectMetadata, decodeAttachmentObject,
  encodeAttachmentObject } from "./attachment-object-content";

/** Re-encode old project-key versions into verified immutable forge objects. */
export async function rotateForgeAttachmentsBatch(limit = 10) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid forge attachment rotation batch size");
  }
  const service = getServiceClient();
  const candidates = await service.rpc("list_forge_attachment_rotation_candidates",
    { p_limit: limit });
  if (candidates.error) throw new Error("Unable to scan forge attachment rotation");
  const result = { scanned: 0, rotated: 0, unchanged: 0,
    conflicted: 0, failed: 0, orphansRemoved: 0, abandonedRemoved: 0 };
  for (const row of candidates.data ?? []) {
    result.scanned++;
    const path = row.storage_path as string;
    let version: number;
    try {
      const current = await getContentKeys().current({ kind: "project", id: row.project_id });
      version = current.version;
      current.bytes.fill(0);
    } catch {
      result.failed++;
      await service.rpc("mark_forge_attachment_rotation_checked", {
        p_id: row.id, p_expected_path: path,
        p_expected_version: row.content_key_version,
      });
      continue;
    }
    if (row.content_key_version > version) {
      result.failed++;
      await service.rpc("mark_forge_attachment_rotation_checked", {
        p_id: row.id, p_expected_path: path,
        p_expected_version: row.content_key_version,
      });
      continue;
    }
    if (row.content_key_version === version) {
      const marked = await service.rpc("mark_forge_attachment_rotation_checked", {
        p_id: row.id, p_expected_path: path,
        p_expected_version: row.content_key_version,
      });
      if (marked.error) result.failed++;
      else result.unchanged++;
      continue;
    }
    const target = `projects/${row.project_id}/forge/${row.id}/${randomUUID()}`;
    try {
      const source = await service.storage.from(FORGE_ATTACHMENTS_BUCKET).download(path);
      if (source.error || !source.data) throw new Error("Missing forge attachment");
      const clear = await decodeAttachmentObject(path,
        Buffer.from(await source.data.arrayBuffer()));
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
      if (verified.error || !verified.data ||
          !Buffer.from(await decodeAttachmentObject(target,
            Buffer.from(await verified.data.arrayBuffer()))).equals(clear)) {
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
      const removed = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
        .remove([path]);
      if (removed.error) throw new Error("Unable to retire old forge attachment");
      result.rotated++;
    } catch {
      result.failed++;
    }
    const marked = await service.rpc("mark_forge_attachment_rotation_checked", {
      p_id: row.id, p_expected_path: path,
      p_expected_version: row.content_key_version,
    });
    if (marked.error) result.failed++;
  }
  const orphans = await service.rpc("list_forge_attachment_orphans", { p_limit: limit });
  if (orphans.error) throw new Error("Unable to scan forge attachment orphans");
  for (const row of orphans.data ?? []) {
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
