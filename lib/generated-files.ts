/**
 * The files Numo writes (MIN-793): which formats it can produce, and the
 * shape of a `create_file` result that the thread turns into a file card.
 *
 * Pure and shared: the server builds the files from this catalog, the chat
 * reads the results back with {@link generatedFileFromResult}, and the file
 * door names an object of the owner's chat storage with
 * {@link generatedFileMimeType}.
 */

export const GENERATED_FILE_FORMATS = {
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  html: "text/html",
  xml: "application/xml",
  svg: "image/svg+xml",
  ics: "text/calendar",
  pdf: "application/pdf",
} as const;

export type GeneratedFileFormat = keyof typeof GENERATED_FILE_FORMATS;

export function isGeneratedFileFormat(value: unknown): value is GeneratedFileFormat {
  return typeof value === "string" && Object.hasOwn(GENERATED_FILE_FORMATS, value);
}

/** Control characters and those file systems refuse in a name become spaces. */
export function withoutUnsafeNameCharacters(name: string): string {
  return [...name].map((char) => {
    const code = char.codePointAt(0)!;
    return code < 0x20 || code === 0x7f || '/\\:*?"<>|'.includes(char) ? " " : char;
  }).join("");
}

/** The type a file name's extension announces, among the generated formats only. */
export function generatedFileMimeType(fileName: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName.trim())?.[1]?.toLowerCase();
  return extension && isGeneratedFileFormat(extension)
    ? GENERATED_FILE_FORMATS[extension]
    : null;
}

/** What the thread needs to show and serve a generated file. */
export interface GeneratedFile {
  /** `numo:<uuid>` — the reference the attachment tools accept. */
  attachment_id: string;
  file_name: string;
  format: GeneratedFileFormat;
  mime_type: string;
  size_bytes: number;
  /** `chat/<owner>/<uuid>`, private to the person who asked for it. */
  storage_path: string;
}

const STORAGE_PATH = /^chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;

/** The file a successful `create_file` result describes, or null. */
export function generatedFileFromResult(result: unknown): GeneratedFile | null {
  if (!result || typeof result !== "object") return null;
  const file = result as Record<string, unknown>;
  if (typeof file.attachment_id !== "string" || !file.attachment_id.startsWith("numo:") ||
      typeof file.file_name !== "string" || !file.file_name ||
      !isGeneratedFileFormat(file.format) || typeof file.mime_type !== "string" ||
      typeof file.size_bytes !== "number" || typeof file.storage_path !== "string" ||
      !STORAGE_PATH.test(file.storage_path)) {
    return null;
  }
  return {
    attachment_id: file.attachment_id,
    file_name: file.file_name,
    format: file.format,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    storage_path: file.storage_path,
  };
}

/** Same-origin address of a generated file, named for the browser. */
export function generatedFileUrl(file: Pick<GeneratedFile, "storage_path" | "file_name">,
  disposition: "download" | "preview"): string {
  const qs = new URLSearchParams({ path: file.storage_path, name: file.file_name });
  qs.set(disposition, "1");
  return `/api/attachments/file?${qs.toString()}`;
}
