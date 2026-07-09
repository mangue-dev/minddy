import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { signedAttachmentUrl } from "@/lib/server/attachments";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/attachments/file?path=…&download=0|1 — the single read door for the
 * private `attachments` bucket. Access is derived from the path prefix
 * (`projects/{pid}/…` → project member, `chat/{uid}/…` → that user), then we
 * 302 to a short-lived signed URL. Stable enough to be an <img src>, a
 * download link, and the URL handed to OpenRouter for vision.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const path = request.nextUrl.searchParams.get("path") ?? "";
  const download = request.nextUrl.searchParams.get("download") === "1";
  const segments = path.split("/");
  if (segments.length < 3 || path.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [family, owner] = segments;
  if (family === "chat") {
    if (owner !== auth.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } else if (family === "projects") {
    if (!UUID_RE.test(owner) || !(await getProjectAccess(auth.user.id, owner))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  } else {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = await signedAttachmentUrl(getServiceClient(), path, {
    download,
  });
  if (!url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
