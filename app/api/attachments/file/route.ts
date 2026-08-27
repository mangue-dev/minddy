import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { attachmentPreviewKind } from "@/lib/attachment-preview";
import {
  isInlineSafeMimeType,
  normalizeMimeType,
  sniffMimeType,
} from "@/lib/inline-safe";

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

function fileNameFromPath(path: string): string {
  return path.split("/").at(-1)?.trim() || "attachment";
}

function contentDisposition(inline: boolean, fileName: string): string {
  if (inline) return "inline";
  return `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * GET /api/attachments/file?path=…&download=0|1&preview=0|1 — the single read door for the
 * private `attachments` bucket. Access is derived from the path prefix
 * (`projects/{pid}/…` → project member, `chat/{uid}/…` → that user), then the
 * file is streamed through a same-origin response so the storage host never
 * reaches the browser. Preview mode accepts every browser-compatible format;
 * ordinary reads use the stricter inline allowlist, and every other response
 * forces a download. Active previews are sandboxed both here and by the viewer
 * iframe.
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
  const bucket = service.storage.from("attachments");
  const [{ data: info }, { data: file, error }] = await Promise.all([
    bucket.info(path),
    bucket.download(path),
  ]);
  if (error || !file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const storedMimeType = normalizeMimeType(info?.contentType || file.type);
  const mimeType = sniffMimeType(bytes) ?? storedMimeType;
  const inline = preview
    ? attachmentPreviewKind(mimeType) !== null
    : !download && isInlineSafeMimeType(mimeType);
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
    "Content-Disposition": contentDisposition(inline, fileNameFromPath(path)),
    "Content-Length": String(bytes.byteLength),
    "Content-Type": mimeType || "application/octet-stream",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (inline) {
    headers["Content-Security-Policy"] = PREVIEW_CSP;
    headers["X-Frame-Options"] = "SAMEORIGIN";
  }

  return new NextResponse(bytes, { headers });
}
