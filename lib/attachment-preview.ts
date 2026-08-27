import { normalizeMimeType } from "@/lib/inline-safe";

export type AttachmentPreviewKind = "image" | "document" | "audio" | "video";

const DOCUMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/javascript",
  "application/json",
  "application/pdf",
  "application/toml",
  "application/xml",
  "application/x-yaml",
  "application/xhtml+xml",
  "application/yaml",
]);

/**
 * Return the browser surface that can display an attachment, or null when the
 * file should remain download-only. Active documents are rendered by the
 * sandboxed preview endpoint and iframe, never by the app document itself.
 */
export function attachmentPreviewKind(
  rawMimeType: string | null | undefined
): AttachmentPreviewKind | null {
  const mimeType = normalizeMimeType(rawMimeType);
  if (!mimeType) return null;

  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
    return "image";
  }
  if (
    mimeType.startsWith("text/") ||
    DOCUMENT_MIME_TYPES.has(mimeType) ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  ) {
    return "document";
  }
  return null;
}
