/**
 * What we agree to DISPLAY, and what we just return (MIN-340).
 *
 * An uploaded file has two MIME types, and neither of them is a
 * measure: the one that the browser ANNOUNCES at the time of sending, and the one which we
 * stores in the line. Both come from the customer. Serving a file "en
 * `inline`" on the basis of one of them, is letting a member choose what
 * their file will be: a `.png` which contains HTML, or an SVG carrying a
 * `<script>`, becomes an executed DOCUMENT by the browser that opens it.
 *
 * Hence two guards, and you need both:
 *
 * - an ALLOWLIST ({@link isInlineSafeMimeType}) — outside the list, the response carries
 * `Content-Disposition: attachment`, which never returns anything;
 * - a SNIFF of bytes ({@link resolveUploadedMimeType}) wherever we hold
 * the contents on save, so that the stored type describes what the
 * file IS rather than what it IS claims.
 *
 * `image/svg+xml` is deliberately unlisted: it is an XML document with scripts and links, not a bitmap image. It always displays in a
 * `<img>` (the layout only governs navigation); what it prevents,
 * is REACHING it directly.
 *
 * This module is pure: no base, no storage, no `server-only` — the
 * same rule is used for the server which signs a URL and for the test which signs it checks.
 */

/**
 * Types served AS IS. What's left here is what our views actually display — the bitmap images — plus the two formats that we open without thinking. The rest downloads, which an attachment link already does.
 */
export const INLINE_SAFE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  "text/plain",
]);

/** `Image/PNG; charset=utf-8` → `image/png`. The parameter doesn't decide anything. */
export function normalizeMimeType(raw: string | null | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.split(";")[0].trim().toLowerCase();
}

/** Can this type be served without `Content-Disposition: attachment`? */
export function isInlineSafeMimeType(raw: string | null | undefined): boolean {
  return INLINE_SAFE_MIME_TYPES.has(normalizeMimeType(raw));
}

/** The type under which a file will be SERVED (see the allowlist above). */
export function servedMimeType(raw: string | null | undefined): string {
  const type = normalizeMimeType(raw);
  return INLINE_SAFE_MIME_TYPES.has(type) ? type : "application/octet-stream";
}

/** The bytes that reliably identify a format, in the order in which they are tested. A `null` in byte position means “any”. */
const MAGIC: { mime: string; offset: number; bytes: (number | null)[] }[] = [
  // \x89PNG\r\n\x1a\n
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // RIFF ???? WEBP
  {
    mime: "image/webp",
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  // ???? ftypavif / ftypavis (ISOBMFF box)
  {
    mime: "image/avif",
    offset: 4,
    bytes: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69],
  },
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
];

/** How many leading bytes are enough to decide — everything after that is
 content, and the sniff has nothing to look for there. */
export const MIME_SNIFF_BYTES = 1024;

/** The textual headers that make a file a DOCUMENT, regardless of the
 name it has. The `<?xml` is there for the properly declared SVG. */
const MARKUP_PREFIXES: { mime: string; starts: string[] }[] = [
  { mime: "image/svg+xml", starts: ["<svg"] },
  {
    mime: "text/html",
    starts: ["<!doctype html", "<html", "<head", "<body", "<script", "<iframe", "<a href"],
  },
];

/**
 * The type that the BYTES reveal, or `null` when they reveal nothing.
 *
 * Binary formats are read by their signature; the text is read on
 * its first element — a `<?xml … ?>` then a `<svg>` remains an SVG, hence the
 * skipping the prologue and comments before comparing.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  for (const sig of MAGIC) {
    if (bytes.length < sig.offset + sig.bytes.length) continue;
    let hit = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      const expected = sig.bytes[i];
      if (expected !== null && bytes[sig.offset + i] !== expected) {
        hit = false;
        break;
      }
    }
    if (hit) return sig.mime;
  }

  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, MIME_SNIFF_BYTES))
    // BOM, spaces, XML prologue and comments: decoration before the element.
    .replace(/^﻿/, "")
    .replace(/^\s+/, "")
    .replace(/^<\?xml[^>]*\?>/i, "")
    .replace(/^(?:\s|<!--[\s\S]*?-->)*/, "")
    .toLowerCase();

  for (const { mime, starts } of MARKUP_PREFIXES) {
    if (starts.some((s) => head.startsWith(s))) return mime;
  }
  return null;
}

/**
 * The type to STORE for a file whose bytes are held.
 *
 * Three cases, and the third is the one that counts: the bytes decide when
 * they can; otherwise a type declared outside the allowlist is kept as is (it
 * will never be served `inline`, and it correctly names the file icon);
 * otherwise — a display type that the bytes do not CONFIRM — we fall back on
 * `application/octet-stream`. It is exactly the `.png` which is not one.
 *
 * `text/plain` is the only exception, due to lack of signature: text without
 * head tag remains text.
 */
export function resolveUploadedMimeType(
  declared: string | null | undefined,
  bytes: Uint8Array
): string {
  const sniffed = sniffMimeType(bytes);
  if (sniffed) return sniffed;
  const type = normalizeMimeType(declared);
  if (!type) return "application/octet-stream";
  if (type === "text/plain") return type;
  return INLINE_SAFE_MIME_TYPES.has(type) ? "application/octet-stream" : type;
}
