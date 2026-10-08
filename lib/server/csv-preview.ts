import "server-only";
import Papa from "papaparse";

export const CSV_PREVIEW_MAX_ROWS = 500;
export const CSV_PREVIEW_MAX_COLUMNS = 100;
export const CSV_PREVIEW_MAX_CELL_CHARACTERS = 2_000;
const MAX_PREVIEW_CHARACTERS = 1_000_000;

interface CsvPreviewOptions {
  fileName: string;
  locale: string;
  emptyMessage: string;
  truncatedMessage: string;
  theme?: "light" | "dark";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

/** Render CSV values as inert table cells inside the existing preview sandbox. */
export function renderCsvPreview(
  bytes: Uint8Array,
  rawMimeTypes: Array<string | null | undefined>,
  options: CsvPreviewOptions,
): string {
  const text = new TextDecoder(csvPreviewCharset(bytes, ...rawMimeTypes)).decode(bytes);
  const parsed = Papa.parse<string[]>(text.trim().length === 0 ? "" : text, {
    // Include the header and one extra record to detect a shortened preview.
    preview: CSV_PREVIEW_MAX_ROWS + 2,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  const rows = parsed.data.slice(0, CSV_PREVIEW_MAX_ROWS + 1);
  const columnCount = Math.min(CSV_PREVIEW_MAX_COLUMNS,
    rows.reduce((count, row) => Math.max(count, row.length), 0));
  let truncated = parsed.data.length > rows.length || parsed.meta.truncated;
  let remainingCharacters = MAX_PREVIEW_CHARACTERS;
  const renderedRows: string[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    if (remainingCharacters === 0) {
      truncated = true;
      break;
    }
    if (row.length > columnCount) truncated = true;
    const cells = Array.from({ length: columnCount }, (_, columnIndex) => {
      const value = row[columnIndex] ?? "";
      const limit = Math.min(CSV_PREVIEW_MAX_CELL_CHARACTERS, remainingCharacters);
      remainingCharacters -= Math.min(value.length, limit);
      const shortened = value.length > limit;
      if (shortened) truncated = true;
      const content = escapeHtml(value.slice(0, limit)) + (shortened ? "…" : "");
      return rowIndex === 0
        ? `<th scope="col"><div>${content}</div></th>`
        : `<td><div>${content}</div></td>`;
    });
    renderedRows.push(`<tr>${cells.join("")}</tr>`);
  }

  const content = renderedRows.length === 0
    ? `<p class="empty">${escapeHtml(options.emptyMessage)}</p>`
    : `<div class="scroll" tabindex="0" role="region" aria-label="${escapeHtml(options.fileName)}">
<table aria-label="${escapeHtml(options.fileName)}"><thead>${renderedRows[0]}</thead>
<tbody>${renderedRows.slice(1).join("")}</tbody></table></div>`;

  return `<!doctype html>
<html lang="${escapeHtml(options.locale)}"${options.theme ? ` data-theme="${options.theme}"` : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.fileName)}</title>
<style>
:root { color-scheme: ${options.theme ?? "light dark"}; --bg: #fff; --fg: #202124; --muted: #62666d; --line: #e5e7eb; --header: #f5f6f8; --stripe: #fafbfc; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { --bg: #18191c; --fg: #eceef2; --muted: #a5a9b2; --line: #34363d; --header: #23252b; --stripe: #1e2025; }
}
:root[data-theme="dark"] { --bg: #18191c; --fg: #eceef2; --muted: #a5a9b2; --line: #34363d; --header: #23252b; --stripe: #1e2025; }
* { box-sizing: border-box; }
body { margin: 0; height: 100dvh; display: flex; flex-direction: column; background: var(--bg); color: var(--fg); font: 13px/1.5 system-ui, sans-serif; }
.scroll { flex: 1; min-height: 0; overflow: auto; }
.scroll:focus-visible { outline: 2px solid var(--muted); outline-offset: -2px; }
table { border-collapse: separate; border-spacing: 0; min-width: 100%; text-align: left; }
th, td { padding: 10px 14px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); vertical-align: top; }
th { position: sticky; top: 0; z-index: 1; background: var(--header); font-weight: 600; }
th div, td div { min-width: 100px; max-width: 420px; white-space: pre-wrap; overflow-wrap: anywhere; }
tbody tr:nth-child(even) { background: var(--stripe); }
.notice, .empty { margin: 0; padding: 14px 18px; color: var(--muted); }
.notice { border-top: 1px solid var(--line); }
.empty { margin: auto; }
</style></head><body>${content}
${truncated ? `<p class="notice">${escapeHtml(options.truncatedMessage)}</p>` : ""}
</body></html>`;
}

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
