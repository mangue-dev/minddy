import { unzipSync, strFromU8 } from "fflate";
import Papa from "papaparse";
import {
  DATABASE_ARCHIVE_FORMAT,
  DATABASE_ARCHIVE_VERSION,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_EXPANDED_BYTES,
  MAX_IMPORT_PAGES,
  type DatabaseArchive,
  type ImportSource,
  type PreparedDatabaseImport,
} from "./types";
import { inferColumns } from "./mapping";

export function cleanArchivePath(path: string): string {
  const parts = path.replaceAll("\\", "/").split("/");
  if (
    path.startsWith("/") ||
    parts.includes("..") ||
    /^[a-z]:/i.test(path) ||
    path.includes("\0")
  )
    throw new Error("importInvalidArchive");
  return parts.filter((p) => p && p !== ".").join("/");
}
export function archiveTitle(path: string): string {
  return path
    .split("/")
    .at(-1)!
    .replace(/\.(md|csv)$/i, "")
    .replace(/(?:_all)?\s+[a-f0-9]{32}(?:_all)?$/i, "")
    .replace(/_all$/, "");
}

/** Check declared expanded sizes before decompression, including nested Notion ZIPs. */
export function readDatabaseArchive(
  bytes: Uint8Array,
  filename: string,
): PreparedDatabaseImport {
  if (bytes.length > MAX_IMPORT_BYTES) throw new Error("importTooLarge");
  let expanded = 0;
  let count = 0;
  const files: Record<string, Uint8Array> = Object.create(null);
  const unpack = (data: Uint8Array, depth: number, prefix: string) => {
    if (depth > 3) throw new Error("importInvalidArchive");
    const extracted = unzipSync(data, {
      filter(file) {
        if (++count > 5000) throw new Error("importTooLarge");
        expanded += file.originalSize;
        if (expanded > MAX_IMPORT_EXPANDED_BYTES)
          throw new Error("importTooLarge");
        cleanArchivePath(file.name);
        return !file.name.endsWith("/") && !file.name.startsWith("__MACOSX/");
      },
    });
    for (const [name, value] of Object.entries(extracted)) {
      const path = prefix + cleanArchivePath(name);
      if (/\.zip$/i.test(path))
        unpack(value, depth + 1, path.slice(0, -4) + "/");
      else {
        if (files[path]) throw new Error("importInvalidArchive");
        files[path] = value;
      }
    }
  };
  if (/\.csv$/i.test(filename)) files[cleanArchivePath(filename)] = bytes;
  else if (/\.zip$/i.test(filename)) {
    try {
      unpack(bytes, 0, "");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("import"))
        throw error;
      throw new Error("importInvalidArchive");
    }
  } else throw new Error("importInvalidArchive");

  const manifestPath = Object.keys(files).find(
    (path) => path.split("/").at(-1) === "minddy-database.json",
  );
  if (manifestPath) {
    let native: DatabaseArchive;
    try {
      native = JSON.parse(strFromU8(files[manifestPath]));
    } catch {
      throw new Error("importInvalidArchive");
    }
    if (
      native.format !== DATABASE_ARCHIVE_FORMAT ||
      native.version !== DATABASE_ARCHIVE_VERSION ||
      !Array.isArray(native.pages) ||
      native.pages.length > MAX_IMPORT_PAGES ||
      !Array.isArray(native.files) ||
      !Array.isArray(native.people)
    )
      throw new Error("importInvalidArchive");
    const prefix = manifestPath.slice(0, -"minddy-database.json".length);
    if (prefix) {
      native = {
        ...native,
        files: native.files.map((file) => ({
          ...file,
          path: prefix + cleanArchivePath(file.path),
        })),
      };
    }
    return {
      files,
      sources: native.pages
        .filter((page) => page.database_schema != null)
        .map((page) => ({
          id: page.id,
          title: page.title,
          headers: [],
          rows: [],
          columns: [],
          native,
        })),
    };
  }
  const csvs = Object.keys(files).filter((path) => /\.csv$/i.test(path));
  // Notion may include a view export and its complete `_all` counterpart.
  const selected = csvs.filter(
    (path) => !csvs.includes(path.replace(/\.csv$/i, "_all.csv")),
  );
  const sources: ImportSource[] = selected.map((path) => {
    const parsed = Papa.parse<string[]>(strFromU8(files[path]), {
      skipEmptyLines: "greedy",
    });
    if (
      parsed.errors.some((error) => error.code !== "UndetectableDelimiter") ||
      parsed.data.length < 1
    )
      throw new Error("importInvalidArchive");
    const [headers, ...rows] = parsed.data;
    if (
      !headers.length ||
      headers.length > 100 ||
      rows.length > MAX_IMPORT_PAGES ||
      rows.some((row) => row.length !== headers.length)
    )
      throw new Error("importTooLarge");
    return {
      id: path,
      title: archiveTitle(path),
      headers,
      rows,
      columns: inferColumns(headers, rows),
    };
  });
  if (!sources.length) throw new Error("importNoDatabase");
  return { files, sources };
}
