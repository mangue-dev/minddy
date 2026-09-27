import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isContentEncryptionEnabled } from "./content-config";
import { attachmentObjectMetadata, attachmentObjectScope,
  decodeAttachmentObject, isEncryptedAttachmentObject } from
  "./attachment-object-content";
import { getContentKeys } from "./registry";
import { attachmentPathDigest, opaqueAttachmentPath,
  resolveAttachmentObjectPath, uploadPrivateAttachmentObject } from
  "@/lib/server/attachments";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function opaque(path: string): boolean {
  return /^(projects|chat)\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(path) ||
    /^projects\/[0-9a-f-]{36}\/pages\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i
      .test(path);
}

function newPath(oldPath: string): string {
  const parts = oldPath.split("/");
  if (!UUID.test(parts[1] ?? "")) throw new Error("Invalid attachment owner path");
  if (parts[0] === "projects") {
    const prefix = parts[2] === "pages" && UUID.test(parts[3] ?? "")
      ? `projects/${parts[1]}/pages/${parts[3]}`
      : `projects/${parts[1]}`;
    return opaqueAttachmentPath(prefix);
  }
  if (parts[0] === "chat") return opaqueAttachmentPath(`chat/${parts[1]}`);
  throw new Error("Invalid attachment path family");
}

/** Move old named objects to opaque paths and encrypt their bytes in bounded batches. */
export async function backfillAttachmentObjectsBatch(limit = 10,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_ATTACHMENT_OBJECT_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Attachment object encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid attachment object batch size");
  }
  const result = { scanned: 0, migrated: 0, marked: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const candidates = await service.rpc("list_attachment_object_migration_candidates",
    { p_limit: limit });
  if (candidates.error) throw new Error("Unable to scan attachment objects");
  for (const row of candidates.data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    const oldPath = row.name as string;
    const migrateOne = async (): Promise<"migrated" | "marked" | "conflicted"> => {
      const resolved = await resolveAttachmentObjectPath(service, oldPath);
      if (resolved !== oldPath) {
        const replacement = await service.storage.from("attachments").download(resolved);
        if (replacement.error || !replacement.data) return "conflicted";
        await decodeAttachmentObject(resolved,
          Buffer.from(await replacement.data.arrayBuffer()));
        const removed = await service.storage.from("attachments").remove([oldPath]);
        if (removed.error) throw new Error("Unable to remove named attachment object");
        const forgotten = await service.from("attachment_object_encrypted")
          .delete().eq("path", oldPath);
        if (forgotten.error) throw new Error("Unable to unregister retired attachment object");
        return "migrated";
      }
      const source = await service.storage.from("attachments").download(oldPath);
      if (source.error || !source.data) return "conflicted";
      const stored = Buffer.from(await source.data.arrayBuffer());
      const bytes = isEncryptedAttachmentObject(stored)
        ? await decodeAttachmentObject(oldPath, stored) : stored;
      if (opaque(oldPath) && isEncryptedAttachmentObject(stored)) {
        const metadata = attachmentObjectMetadata(stored);
        const key = await getContentKeys().current(attachmentObjectScope(oldPath));
        const currentVersion = key.version;
        key.bytes.fill(0);
        if (metadata.format_version === 4 &&
            metadata.content_key_version === currentVersion) {
          const marked = await service.from("attachment_object_encrypted")
            .upsert({ path: oldPath, ...metadata },
              { onConflict: "path" });
          if (marked.error) throw new Error("Unable to mark encrypted object");
          return "marked";
        }
      }
      const target = newPath(oldPath);
      await uploadPrivateAttachmentObject(service, target, bytes,
        source.data.type || "application/octet-stream");
      const copy = await service.storage.from("attachments").download(target);
      if (copy.error || !copy.data ||
          !Buffer.from(await decodeAttachmentObject(target,
            Buffer.from(await copy.data.arrayBuffer()))).equals(bytes)) {
        await service.storage.from("attachments").remove([target]);
        throw new Error("Attachment replacement verification failed");
      }
      const digest = await attachmentPathDigest(oldPath);
      const swapped = await service.rpc(row.format_version != null
        ? "rotate_attachment_object_references"
        : "migrate_attachment_object_references", row.format_version != null
        ? { p_old_path: oldPath, p_new_path: target, p_old_digest: digest,
          p_expected_format: row.format_version,
          p_expected_key_version: row.content_key_version }
        : { p_old_path: oldPath, p_new_path: target, p_old_digest: digest });
      if (swapped.error || !swapped.data) {
        await service.storage.from("attachments").remove([target]);
        return "conflicted";
      }
      const removed = await service.storage.from("attachments").remove([oldPath]);
      if (removed.error) throw new Error("Unable to remove named attachment object");
      if (row.format_version != null) {
        const forgotten = await service.from("attachment_object_encrypted")
          .delete().eq("path", oldPath);
        if (forgotten.error) throw new Error("Unable to unregister retired attachment object");
      }
      return "migrated";
    };
    try {
      result[await migrateOne()]++;
    } catch { result.failed++; }
    const recorded = await service.rpc("record_attachment_object_migration_attempt",
      { p_id: row.id });
    if (recorded.error) throw new Error("Unable to advance attachment object queue");
  }
  return result;
}
