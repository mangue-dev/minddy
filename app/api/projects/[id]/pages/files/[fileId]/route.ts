import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import { getPageFilePath } from "@/lib/server/page-files";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET /api/projects/[id]/pages/files/[fileId] — the port for reading a file
 * (MIN-280). `?download=1` to save it rather than display it.
 *
 * It is THIS URL which is stored in the document, and it is for this that it
 * must be stable and without secrets: it survives for months in a body, it
 * passes through the markdown projection that Numo reads, and it serves as `src` for a
 * `<img>` tag. The private file is served by a 302 redirection to
 * a short-lived signed URL — exactly the montage of
 * `/api/attachments/file`, with an identifier instead of a path.
 *
 * The access is read on the PROJECT of the URL, and the line must belong to it: without
 * this second condition, a valid file ID would be exposed under
 * any project of which we are a member.
 *
 * A page in the trash keeps its files readable — same bias as its
 * activity and its trackbacks: the basket is reversible, and an image which
 * would stop charging before purging would make it appear as a loss.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: projectId, fileId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await getProjectAccess(auth.user.id, projectId))) return notFound;

  const service = getServiceClient();
  const file = await getPageFilePath(service, projectId, fileId);
  if (!file) return notFound;

  const download = request.nextUrl.searchParams.get("download") === "1";
  const url = await signedAttachmentUrl(service, file.storage_path, {
    download: download ? file.file_name : false,
    // The type of the LINE is authentic here: it was deducted from the bytes when sending
    // (lib/server/page-files.ts), sending a page file through the
    // server. Outside the allowlist, the signature will return as an “attachment”
    // (MIN-340) — a `.png` containing HTML must not be opened.
    mimeType: file.mime_type,
  });
  if (!url) return notFound;

  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
