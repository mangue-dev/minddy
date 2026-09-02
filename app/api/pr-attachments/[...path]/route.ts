import { NextResponse } from "next/server";

import {
  FORGE_ATTACHMENTS_BUCKET,
  forgeAttachmentStoragePath,
} from "@/lib/forge-image-assets";
import { servedMimeType } from "@/lib/inline-safe";
import { getServiceClient } from "@/lib/supabase-service";

type RouteContext = { params: Promise<{ path: string[] }> };

/** Public, immutable proxy for files already published in forge comments. */
export async function GET(_request: Request, { params }: RouteContext) {
  const storagePath = forgeAttachmentStoragePath((await params).path);
  if (!storagePath) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const service = getServiceClient();
  const { data, error } = await service.storage
    .from(FORGE_ATTACHMENTS_BUCKET)
    .download(storagePath);
  if (error || !data) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  const fileName = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const bytes = await data.arrayBuffer();
  return new Response(bytes, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": servedMimeType(data.type),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
