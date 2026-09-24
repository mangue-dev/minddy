import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { projectStorageAllowed } from "@/lib/server/storage-quota";
import { resolveUploadedMimeType } from "@/lib/inline-safe";
import { MAX_ATTACHMENT_BYTES, opaqueAttachmentPath,
  uploadPrivateAttachmentObject } from "@/lib/server/attachments";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Authenticated upload door for private attachment object bytes. */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const form = await request.formData().catch(() => null);
  const prefix = form?.get("prefix");
  const file = form?.get("file");
  if (typeof prefix !== "string" || !(file instanceof File) ||
      !Number.isSafeInteger(file.size) || file.size > MAX_ATTACHMENT_BYTES ||
      !file.name.trim()) {
    return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
  }
  const segments = prefix.split("/");
  if (segments.length !== 2 || !UUID.test(segments[1]) ||
      (segments[0] !== "projects" && segments[0] !== "chat")) {
    return NextResponse.json({ error: "Invalid attachment scope" }, { status: 400 });
  }
  const service = getServiceClient();
  if (segments[0] === "projects") {
    if (!(await getProjectAccess(auth.user.id, segments[1])) ||
        !(await projectStorageAllowed(service, segments[1],
          Math.ceil(file.size * 1.4) + 4096))) {
      return NextResponse.json({ error: "Attachment storage unavailable" }, { status: 403 });
    }
  } else {
    if (segments[1] !== auth.user.id) {
      return NextResponse.json({ error: "Attachment scope unavailable" }, { status: 403 });
    }
    const quota = await service.rpc("account_storage_quota_allows", {
      p_user: auth.user.id, p_additional_bytes: Math.ceil(file.size * 1.4) + 4096,
    });
    if (quota.error || quota.data !== true) {
      return NextResponse.json({ error: "Attachment storage unavailable" }, { status: 403 });
    }
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = resolveUploadedMimeType(file.type, bytes).slice(0, 120);
  const path = opaqueAttachmentPath(prefix);
  try {
    await uploadPrivateAttachmentObject(service, path, bytes, mimeType);
  } catch {
    return NextResponse.json({ error: "Attachment upload failed" }, { status: 500 });
  }
  return NextResponse.json({ storage_path: path,
    file_name: file.name.trim().slice(0, 200), mime_type: mimeType,
    size_bytes: bytes.byteLength });
}
