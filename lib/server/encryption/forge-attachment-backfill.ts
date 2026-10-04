import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";
import { attachmentObjectMetadata, decodeAttachmentObject,
  encodeAttachmentObject } from "./attachment-object-content";
import { hasDataRootKey } from "./local-key-wrapper";

/** Move historical forge uploads to verified ciphertext and opaque paths. */
export async function backfillForgeAttachmentsBatch(limit = 10, signal?: AbortSignal) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid forge attachment batch size");
  }
  if (!hasDataRootKey()) throw new Error("Forge attachment root key is unavailable");
  signal?.throwIfAborted();
  const service = getServiceClient();
  const candidates = await service.rpc("list_forge_attachment_migration_candidates",
    { p_limit: limit });
  if (candidates.error) throw new Error("Unable to scan forge attachments");
  const probe = (candidates.data ?? []).find((row: { migrated_path?: string | null }) =>
    !row.migrated_path);
  if (probe) {
    const path = `projects/${probe.project_id}/forge/preflight/${randomUUID()}`;
    const sealed = await encodeAttachmentObject(path, Buffer.alloc(0));
    if ((await decodeAttachmentObject(path, sealed)).length !== 0) {
      throw new Error("Forge attachment crypto preflight failed");
    }
  }
  const activated = await service.rpc("activate_forge_attachment_encryption");
  if (activated.error || activated.data !== true) {
    throw new Error("Unable to protect forge attachment writers");
  }
  const rows = await service.rpc("list_forge_attachment_migration_candidates",
    { p_limit: limit });
  if (rows.error) throw new Error("Unable to scan forge attachments");
  const result = { scanned: 0, migrated: 0, failed: 0 };
  for (const row of rows.data ?? []) {
    signal?.throwIfAborted();
    result.scanned++;
    const oldPath = row.name as string;
    const digest = createHash("sha256").update(oldPath).digest("hex");
    const id = randomUUID();
    const newPath = `projects/${row.project_id}/forge/${id}/${randomUUID()}`;
    try {
      const source = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
        .download(oldPath);
      if (source.error || !source.data) throw new Error("Missing forge attachment");
      const clear = Buffer.from(await source.data.arrayBuffer());
      const removeVerifiedSource = async (path: string) => {
        const replacement = await service.storage.from(FORGE_ATTACHMENTS_BUCKET).download(path);
        if (replacement.error || !replacement.data) throw new Error("Missing protected forge attachment");
        const bytes = Buffer.from(await replacement.data.arrayBuffer());
        if (!Buffer.from(await decodeAttachmentObject(path, bytes)).equals(clear)) {
          throw new Error("Protected forge attachment differs from its source");
        }
        // Rotation refuses this reference while its legacy object still exists.
        const checked = await service.rpc("verify_forge_attachment_legacy_cleanup", {
          p_digest: digest, p_expected_path: path, p_pr_id: row.pr_id,
          p_project_id: row.project_id,
          p_version: attachmentObjectMetadata(bytes).content_key_version,
          p_object_digest: createHash("sha256").update(bytes).digest("hex"),
        });
        if (checked.error || checked.data !== true) throw new Error("Forge attachment cleanup conflicted");
        const removed = await service.storage.from(FORGE_ATTACHMENTS_BUCKET).remove([oldPath]);
        if (removed.error) throw new Error("Unable to remove legacy forge attachment");
        const released = await service.from("forge_attachment_legacy_owners")
          .delete().eq("old_path_digest", digest);
        if (released.error) throw new Error("Unable to retire forge attachment owner binding");
      };
      if (row.migrated_path) {
        await removeVerifiedSource(row.migrated_path);
        result.migrated++;
      } else {
        const sealed = await encodeAttachmentObject(newPath, clear);
        const uploaded = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
          .upload(newPath, sealed, { contentType: "application/octet-stream",
            metadata: { minddy_encrypted: "true" } });
        if (uploaded.error) throw new Error("Unable to upload protected forge attachment");
        try {
          const check = await service.storage.from(FORGE_ATTACHMENTS_BUCKET)
            .download(newPath);
          if (check.error || !check.data ||
              !Buffer.from(await decodeAttachmentObject(newPath,
                Buffer.from(await check.data.arrayBuffer()))).equals(clear)) {
            throw new Error("Protected forge attachment verification failed");
          }
          const registered = await service.from("forge_attachment_objects").insert({
            id, pr_id: row.pr_id, project_id: row.project_id,
            storage_path: newPath,
            legacy_path_digest: digest,
            published_at: new Date().toISOString(),
            ...attachmentObjectMetadata(sealed),
          });
          if (registered.error) throw new Error("Unable to register protected forge attachment");
        } catch (error) {
          await service.storage.from(FORGE_ATTACHMENTS_BUCKET).remove([newPath]);
          throw error;
        }
        await removeVerifiedSource(newPath);
        result.migrated++;
      }
    } catch {
      result.failed++;
    }
    const attempt = await service.from("forge_attachment_migration_attempts")
      .upsert({ old_path_digest: digest, attempted_at: new Date().toISOString() },
        { onConflict: "old_path_digest" });
    if (attempt.error) throw new Error("Unable to advance forge attachment migration queue");
  }
  return result;
}
