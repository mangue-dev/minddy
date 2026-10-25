import "server-only";

import { renderMarkdownPdf } from "./markdown-pdf";
import { GENERATED_FILE_FORMATS, type GeneratedFileFormat,
  withoutUnsafeNameCharacters } from "@/lib/generated-files";

/**
 * Rendering of the files Numo writes (MIN-793). Storage, references and access
 * live with the other conversation files in `conversation-attachments.ts`.
 */

/** A request the model can correct: its message goes back to the model. */
export class GeneratedFileError extends Error {}

/** Ceiling on what the model may send in one `create_file` call. */
export const MAX_GENERATED_FILE_CHARACTERS = 1_000_000;

/**
 * A name the browser and the destination can keep: no path, no control
 * character, at most 120 characters, ending with the format's extension. A
 * known extension of another format is replaced rather than stacked.
 */
export function generatedFileName(raw: unknown, format: GeneratedFileFormat): string {
  const stem = withoutUnsafeNameCharacters((typeof raw === "string" ? raw : "").normalize("NFC"))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.([a-z0-9]{1,5})$/i, (extension, name: string) =>
      Object.hasOwn(GENERATED_FILE_FORMATS, name.toLowerCase()) ? "" : extension)
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return `${stem || "numo"}.${format}`;
}

/** UTF-8 byte order mark: spreadsheet apps otherwise misread accented CSV. */
const BOM = "\ufeff";

/**
 * The bytes of a generated file. Text formats are written as given (checked
 * when the format has a grammar the model could break); PDF is rendered from
 * Markdown. Throws {@link GeneratedFileError} for content the model must fix.
 */
export async function renderGeneratedFile(format: GeneratedFileFormat, content: string,
  fileName: string): Promise<Uint8Array> {
  switch (format) {
    case "pdf":
      return renderMarkdownPdf(content, fileName.replace(/\.pdf$/i, ""));
    case "json":
      try {
        JSON.parse(content);
      } catch {
        throw new GeneratedFileError("content is not valid JSON.");
      }
      break;
    case "svg":
      if (!/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(content)) {
        throw new GeneratedFileError("content must be an SVG document starting with <svg>.");
      }
      break;
    case "ics":
      if (!/^\s*BEGIN:VCALENDAR/i.test(content)) {
        throw new GeneratedFileError("content must be an iCalendar document starting with BEGIN:VCALENDAR.");
      }
      break;
  }
  const text = format === "csv" || format === "tsv"
    ? `${BOM}${content.replace(/^\ufeff/, "")}`
    : format === "ics"
      ? content.replace(/\r?\n/g, "\r\n")
      : content;
  return new TextEncoder().encode(text);
}
