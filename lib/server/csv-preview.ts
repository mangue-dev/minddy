import "server-only";

/** Choose a browser charset without changing the CSV bytes. */
export function csvPreviewCharset(
  bytes: Uint8Array,
  ...rawMimeTypes: Array<string | null | undefined>
): string {
  // A BOM identifies the encoding even if the stored declaration disagrees.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";

  for (const rawMimeType of rawMimeTypes) {
    const match = rawMimeType?.match(
      /(?:^|;)\s*charset\s*=\s*(?:"([^"]*)"|([^;\s]*))/i,
    );
    const label = match?.[1] ?? match?.[2];
    if (!label) continue;
    try {
      // Canonical labels are supported by browsers and safe in HTTP headers.
      return new TextDecoder(label).encoding;
    } catch {
      // Ignore unsupported declarations and inspect the bytes instead.
    }
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    // Undeclared legacy Excel exports commonly use Windows-1252. Other legacy
    // encodings need a declaration; they cannot be reliably inferred from CSV.
    return "windows-1252";
  }
}
