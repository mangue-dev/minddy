import "server-only";

import { createHash } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";
import { attachmentObjectMetadata, decodeAttachmentObject } from "./attachment-object-content";

type ObjectRow = { id: string; project_id: string; storage_path: string;
  content_key_version: number; format_version: number;
  rotation_checked_at: string | null; verified_object_digest: string | null };
const FIELDS = "id,project_id,storage_path,content_key_version,format_version,rotation_checked_at,verified_object_digest";
const PAGE_SIZE = 100;

/** Observed byte proof only; repeat with quiescent writers and stable counts. */
export async function verifyForgeAttachmentReadiness() {
  const service = getServiceClient();
  const metadata = await service.rpc("forge_attachment_migration_complete");
  if (metadata.error) throw new Error("Unable to verify forge attachment metadata");
  let scanned = 0;
  let blocked = 0;
  let after: string | null = null;
  for (;;) {
    let query = service.from("forge_attachment_objects").select(FIELDS);
    if (after !== null) query = query.gt("id", after);
    const page = await query.order("id").limit(PAGE_SIZE);
    if (page.error || !page.data) throw new Error("Unable to scan forge attachment bytes");
    for (const row of page.data as ObjectRow[]) {
      scanned++;
      try {
        if (!row.rotation_checked_at || !row.verified_object_digest) throw new Error("Forge object lacks proof");
        const current = await service.from("envelope_data_keys").select("version")
          .eq("scope_kind", "project").eq("scope_id", row.project_id)
          .eq("purpose", "content").eq("is_current", true).maybeSingle();
        if (current.error || !current.data || current.data.version !== row.content_key_version) {
          throw new Error("Forge object key version is not current");
        }
        const object = await service.storage.from(FORGE_ATTACHMENTS_BUCKET).download(row.storage_path);
        if (object.error || !object.data) throw new Error("Forge object is unavailable");
        const bytes = Buffer.from(await object.data.arrayBuffer());
        await decodeAttachmentObject(row.storage_path, bytes);
        const found = attachmentObjectMetadata(bytes);
        if (found.format_version < 4 || found.format_version !== row.format_version ||
            found.content_key_version !== row.content_key_version ||
            createHash("sha256").update(bytes).digest("hex") !== row.verified_object_digest) {
          throw new Error("Forge object proof differs from observed bytes");
        }
        const reference = await service.from("forge_attachment_objects").select(FIELDS)
          .eq("id", row.id).maybeSingle();
        const reread = reference.data;
        if (reference.error || !reread ||
            (Object.keys(row) as (keyof ObjectRow)[]).some((key) => reread[key] !== row[key])) {
          throw new Error("Forge object reference changed during verification");
        }
      } catch {
        blocked++;
      }
    }
    if (page.data.length < PAGE_SIZE) break;
    after = page.data.at(-1)!.id;
  }
  const finalMetadata = await service.rpc("forge_attachment_migration_complete");
  if (finalMetadata.error) throw new Error("Unable to recheck forge attachment metadata");
  return { scope: "forge_attachment_objects" as const, ready: metadata.data === true &&
    finalMetadata.data === true && blocked === 0,
  metadataReady: metadata.data === true && finalMetadata.data === true, scanned, blocked };
}
