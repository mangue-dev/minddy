import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

import {
  FORGE_ATTACHMENTS_BUCKET,
  forgeAttachmentStoragePath,
} from "@/lib/forge-image-assets";
import { resolveUploadedMimeType, servedMimeType,
  isInlineSafeMimeType } from "@/lib/inline-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { decodeAttachmentObject } from "@/lib/server/encryption/attachment-object-content";

type RouteContext = { params: Promise<{ path: string[] }> };

/** External capability reader for files published in forge comments. */
export async function GET(_request: Request, { params }: RouteContext) {
  const identity = forgeAttachmentStoragePath((await params).path);
  if (!identity) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const service = getServiceClient();
  const lookup = identity.includes("/")
    ? service.from("forge_attachment_objects").select("storage_path")
      .eq("legacy_path_digest", createHash("sha256").update(identity).digest("hex"))
    : service.from("forge_attachment_objects").select("storage_path")
      .eq("id", identity);
  const { data: entry, error: lookupError } = await lookup.maybeSingle();
  if (lookupError || (!entry && !identity.includes("/"))) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }
  // Historical forge URLs remain readable from the private bucket during the
  // bounded rewrite. Activation must verify that no legacy object remains.
  const storagePath = entry?.storage_path ?? identity;
  const { data, error } = await service.storage
    .from(FORGE_ATTACHMENTS_BUCKET)
    .download(storagePath);
  if (error || !data) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    const stored = Buffer.from(await data.arrayBuffer());
    bytes = entry ? await decodeAttachmentObject(storagePath, stored) : stored;
  } catch {
    return NextResponse.json({ error: "Attachment unavailable" }, { status: 503 });
  }
  const mimeType = servedMimeType(resolveUploadedMimeType(null, bytes));
  return new Response(Uint8Array.from(bytes), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": isInlineSafeMimeType(mimeType) ? "inline" : "attachment",
      "Content-Length": String(bytes.byteLength),
      "Content-Type": mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
