import {
  strFromU8,
  Unzip,
  UnzipInflate,
  UnzipPassThrough,
} from "fflate";
import Papa from "papaparse";
import {
  DATABASE_ARCHIVE_FORMAT,
  DATABASE_ARCHIVE_VERSION,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_EXPANDED_BYTES,
  MAX_IMPORT_FILES,
  MAX_IMPORT_PAGES,
  MAX_IMPORT_PEOPLE,
  MAX_IMPORT_SOURCES,
  type DatabaseArchive,
  type ImportSource,
  type PreparedDatabaseImport,
} from "./types";
import { inferColumns } from "./mapping";

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END = 0x06054b50;
const ZIP_DATA_DESCRIPTOR = 0x08074b50;

function zipU16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length)
    throw new Error("importInvalidArchive");
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function zipU32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length)
    throw new Error("importInvalidArchive");
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function sameBytes(
  bytes: Uint8Array,
  first: number,
  second: number,
  length: number,
): boolean {
  if (first + length > bytes.length || second + length > bytes.length) return false;
  for (let index = 0; index < length; index += 1) {
    if (bytes[first + index] !== bytes[second + index]) return false;
  }
  return true;
}

/** Reject ambiguous ZIP layouts before any payload is inflated. */
function validateZipStructure(bytes: Uint8Array): void {
  let end = -1;
  const earliest = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (
      zipU32(bytes, offset) === ZIP_END &&
      offset + 22 + zipU16(bytes, offset + 20) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("importInvalidArchive");
  if (zipU16(bytes, end + 4) !== 0 || zipU16(bytes, end + 6) !== 0)
    throw new Error("importInvalidArchive");
  const diskEntries = zipU16(bytes, end + 8);
  const entries = zipU16(bytes, end + 10);
  const centralSize = zipU32(bytes, end + 12);
  const centralOffset = zipU32(bytes, end + 16);
  if (
    diskEntries !== entries ||
    entries > 5000 ||
    entries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    centralOffset + centralSize !== end
  )
    throw new Error("importInvalidArchive");

  const localOffsets = new Set<number>();
  const ranges: { start: number; end: number }[] = [];
  let cursor = centralOffset;
  let declaredExpanded = 0;
  for (let index = 0; index < entries; index += 1) {
    if (zipU32(bytes, cursor) !== ZIP_CENTRAL_HEADER)
      throw new Error("importInvalidArchive");
    const flags = zipU16(bytes, cursor + 8);
    const method = zipU16(bytes, cursor + 10);
    const crc = zipU32(bytes, cursor + 16);
    const compressedSize = zipU32(bytes, cursor + 20);
    const originalSize = zipU32(bytes, cursor + 24);
    const nameLength = zipU16(bytes, cursor + 28);
    const extraLength = zipU16(bytes, cursor + 30);
    const commentLength = zipU16(bytes, cursor + 32);
    const disk = zipU16(bytes, cursor + 34);
    const localOffset = zipU32(bytes, cursor + 42);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      next > end ||
      disk !== 0 ||
      (flags & 1) !== 0 ||
      (method !== 0 && method !== 8) ||
      compressedSize === 0xffffffff ||
      originalSize === 0xffffffff ||
      (method === 0 && compressedSize !== originalSize) ||
      localOffsets.has(localOffset) ||
      localOffset >= centralOffset ||
      zipU32(bytes, localOffset) !== ZIP_LOCAL_HEADER
    )
      throw new Error("importInvalidArchive");
    localOffsets.add(localOffset);
    const localFlags = zipU16(bytes, localOffset + 6);
    const localMethod = zipU16(bytes, localOffset + 8);
    const localNameLength = zipU16(bytes, localOffset + 26);
    const localExtraLength = zipU16(bytes, localOffset + 28);
    if (
      localFlags !== flags ||
      localMethod !== method ||
      localNameLength !== nameLength ||
      !sameBytes(bytes, cursor + 46, localOffset + 30, nameLength)
    )
      throw new Error("importInvalidArchive");
    if ((flags & 8) === 0) {
      if (
        zipU32(bytes, localOffset + 14) !== crc ||
        zipU32(bytes, localOffset + 18) !== compressedSize ||
        zipU32(bytes, localOffset + 22) !== originalSize
      )
        throw new Error("importInvalidArchive");
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    let entryEnd = dataEnd;
    if ((flags & 8) !== 0) {
      const descriptor = zipU32(bytes, dataEnd) === ZIP_DATA_DESCRIPTOR ? dataEnd + 4 : dataEnd;
      if (
        zipU32(bytes, descriptor) !== crc ||
        zipU32(bytes, descriptor + 4) !== compressedSize ||
        zipU32(bytes, descriptor + 8) !== originalSize
      )
        throw new Error("importInvalidArchive");
      entryEnd = descriptor + 12;
    }
    if (entryEnd > centralOffset) throw new Error("importInvalidArchive");
    ranges.push({ start: localOffset, end: entryEnd });
    declaredExpanded += originalSize;
    if (declaredExpanded > MAX_IMPORT_EXPANDED_BYTES)
      throw new Error("importTooLarge");
    cursor = next;
  }
  if (cursor !== end) throw new Error("importInvalidArchive");
  ranges.sort((left, right) => left.start - right.start);
  if (
    ranges.length > 0 &&
    (ranges[0].start !== 0 || ranges.at(-1)!.end !== centralOffset)
  )
    throw new Error("importInvalidArchive");
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index - 1].end !== ranges[index].start)
      throw new Error("importInvalidArchive");
  }
}

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

/** Extract ZIP entries incrementally so actual output, not attacker-controlled metadata, owns the limit. */
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
    validateZipStructure(data);
    const extracted: Record<string, Uint8Array> = Object.create(null);
    const unzip = new Unzip((file) => {
      if (++count > 5000) throw new Error("importTooLarge");
      const name = cleanArchivePath(file.name);
      if (!name || name.length > 1024) throw new Error("importInvalidArchive");
      const keep =
        !file.name.endsWith("/") && !file.name.startsWith("__MACOSX/");
      const chunks: Uint8Array[] = [];
      let size = 0;
      file.ondata = (error, chunk, final) => {
        if (error) throw error;
        expanded += chunk.length;
        size += chunk.length;
        if (expanded > MAX_IMPORT_EXPANDED_BYTES)
          throw new Error("importTooLarge");
        if (keep && chunk.length) chunks.push(chunk);
        if (final && keep) {
          if (extracted[name]) throw new Error("importInvalidArchive");
          const value = new Uint8Array(size);
          let offset = 0;
          for (const part of chunks) {
            value.set(part, offset);
            offset += part.length;
          }
          extracted[name] = value;
        }
      };
      file.start();
    });
    unzip.register(UnzipPassThrough);
    unzip.register(UnzipInflate);
    // Small input chunks bound each inflater allocation before the cumulative
    // output check can terminate a highly compressed entry.
    for (let offset = 0; offset < data.length; offset += 8192) {
      const end = Math.min(offset + 8192, data.length);
      unzip.push(data.subarray(offset, end), end === data.length);
    }
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

  const manifestPaths = Object.keys(files).filter(
    (path) => path.split("/").at(-1) === "minddy-database.json",
  );
  if (manifestPaths.length > 1) throw new Error("importInvalidArchive");
  const [manifestPath] = manifestPaths;
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
      native.files.length > MAX_IMPORT_FILES ||
      !Array.isArray(native.people) ||
      native.people.length > MAX_IMPORT_PEOPLE
    )
      throw new Error("importInvalidArchive");
    const prefix = manifestPath.slice(0, -"minddy-database.json".length);
    const fileIds = new Set<string>();
    const filePaths = new Set<string>();
    let referencedBytes = 0;
    const nativeFiles = native.files.map((file) => {
      if (
        !file ||
        typeof file !== "object" ||
        typeof file.id !== "string" ||
        !file.id ||
        file.id.length > 200 ||
        typeof file.page_id !== "string" ||
        !file.page_id ||
        file.page_id.length > 200 ||
        typeof file.path !== "string" ||
        typeof file.file_name !== "string" ||
        !file.file_name.trim() ||
        file.file_name.length > 200 ||
        typeof file.mime_type !== "string" ||
        file.mime_type.length > 120
      )
        throw new Error("importInvalidArchive");
      const path = prefix + cleanArchivePath(file.path);
      if (!path || path.length > 1024 || fileIds.has(file.id) || filePaths.has(path))
        throw new Error("importInvalidArchive");
      fileIds.add(file.id);
      filePaths.add(path);
      referencedBytes += files[path]?.length ?? 0;
      if (referencedBytes > MAX_IMPORT_EXPANDED_BYTES)
        throw new Error("importTooLarge");
      return { ...file, path };
    });
    if (
      native.people.some(
        (person) =>
          !person ||
          typeof person !== "object" ||
          typeof person.id !== "string" ||
          !person.id ||
          person.id.length > 200 ||
          typeof person.name !== "string" ||
          person.name.length > 500,
      )
    ) {
      throw new Error("importInvalidArchive");
    }
    native = { ...native, files: nativeFiles };
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
  if (selected.length > MAX_IMPORT_SOURCES) throw new Error("importTooLarge");
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
