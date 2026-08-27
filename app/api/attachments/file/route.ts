import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import { attachmentPreviewKind } from "@/lib/attachment-preview";
import { normalizeMimeType, sniffMimeType } from "@/lib/inline-safe";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PREVIEW_CSP = [
  "sandbox",
  "default-src 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

function downloadRedirect(url: string): NextResponse {
  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/**
 * GET /api/attachments/file?path=…&download=0|1&preview=0|1 — the single read door for the
 * private `attachments` bucket. Access is derived from the path prefix
 * (`projects/{pid}/…` → project member, `chat/{uid}/…` → that user), then we
 * normally 302 to a short-lived signed URL. Preview mode instead proxies
 * browser-compatible bytes through an inert, same-origin response. Active
 * documents are sandboxed both here and by the viewer iframe, while files the
 * browser cannot display keep the normal forced-download behavior.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const path = request.nextUrl.searchParams.get("path") ?? "";
  const download = request.nextUrl.searchParams.get("download") === "1";
  const preview = !download && request.nextUrl.searchParams.get("preview") === "1";
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

  const service = getServiceClient();
  if (preview) {
    const bucket = service.storage.from("attachments");
    const [{ data: info }, { data: file, error }] = await Promise.all([
      bucket.info(path),
      bucket.download(path),
    ]);
    if (error || !file) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const storedMimeType = normalizeMimeType(info?.contentType || file.type);
    const mimeType = sniffMimeType(bytes) ?? storedMimeType;

    if (attachmentPreviewKind(mimeType)) {
      return new NextResponse(bytes, {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline",
          "Content-Security-Policy": PREVIEW_CSP,
          "Content-Type": mimeType,
          "Cross-Origin-Resource-Policy": "same-origin",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "SAMEORIGIN",
        },
      });
    }

    const url = await signedAttachmentUrl(service, path, {
      download: true,
      mimeType,
    });
    if (!url) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return downloadRedirect(url);
  }

  const url = await signedAttachmentUrl(service, path, { download });
  if (!url) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return downloadRedirect(url);
}
