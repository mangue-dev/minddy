import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readDatabaseArchive } from "./archive";
import { MAX_IMPORT_FILES, MAX_IMPORT_SOURCES } from "./types";
import { prepareImportPages, resolveArchiveLink } from "./prepare";
import { inferColumns, importCell, mappedColumns } from "./mapping";

const db = "Journal abcdef1234567890abcdef1234567890";
const entry = db + "/Kickoff 1234567890abcdef1234567890abcdef.md";
const zip = (files: Record<string, string>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, body]) => [path, strToU8(body)]),
    ),
  );

function u32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function setU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function setU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}

/** Locate the no-comment end record emitted by fflate's deterministic test ZIPs. */
function zipParts(bytes: Uint8Array) {
  const end = bytes.length - 22;
  expect(u32(bytes, end)).toBe(0x06054b50);
  return {
    end,
    centralOffset: u32(bytes, end + 16),
    centralSize: u32(bytes, end + 12),
  };
}

function forgeCentralAliases(payloadBytes: number, entries: number): Uint8Array {
  const base = zipSync(
    { "000000.csv": new Uint8Array(payloadBytes) },
    { level: 0 },
  );
  const { end, centralOffset, centralSize } = zipParts(base);
  const central = base.slice(centralOffset, end);
  const records = Array.from({ length: entries }, (_, index) => {
    const record = central.slice();
    const name = String(index).padStart(6, "0") + ".csv";
    record.set(strToU8(name), 46);
    setU32(record, 24, 1);
    return record;
  });
  const output = new Uint8Array(
    centralOffset + centralSize * entries + 22,
  );
  output.set(base.subarray(0, centralOffset));
  records.forEach((record, index) =>
    output.set(record, centralOffset + centralSize * index),
  );
  const outputEnd = output.length - 22;
  output.set(base.subarray(end), outputEnd);
  setU16(output, outputEnd + 8, entries);
  setU16(output, outputEnd + 10, entries);
  setU32(output, outputEnd + 12, centralSize * entries);
  return output;
}

function forgeSmallExpandedSize(bytes: Uint8Array): Uint8Array {
  const output = bytes.slice();
  const { centralOffset } = zipParts(output);
  const localOffset = u32(output, centralOffset + 42);
  setU32(output, localOffset + 22, 1);
  setU32(output, centralOffset + 24, 1);
  return output;
}

describe("Notion database archives", () => {
  it("imports CSV values, entry bodies, nested pages, and attachment paths together", () => {
    const bytes = zip({
      [db + ".csv"]:
        'Name,Amount,Done,Date,Status,Tags\nKickoff,12.5,Yes,2026-09-06,Ready,"Design, Product"',
      [entry]:
        "# Kickoff\n\nFull body\n\n![Image](Kickoff%201234567890abcdef1234567890abcdef/chart.png)",
      [entry.slice(0, -3) + "/Details abcdabcdabcdabcdabcdabcdabcdabcd.md"]:
        "# Details\n\nNested body",
      [entry.slice(0, -3) + "/chart.png"]: "bytes",
    });
    const prepared = readDatabaseArchive(bytes, "notion.zip");
    expect(prepared.sources).toHaveLength(1);
    expect(prepared.sources[0].columns.map((column) => column.type)).toEqual([
      "title",
      "number",
      "checkbox",
      "date",
      "select",
      "multi_select",
    ]);
    const pages = prepareImportPages(
      prepared,
      prepared.sources[0],
      prepared.sources[0].columns,
      new Map(),
    );
    expect(pages).toHaveLength(3);
    expect(pages[1].markdown).toContain("Full body");
    expect(pages[2].parent_id).toBe(pages[1].id);
    expect(Object.values(pages[1].property_values).slice(0, 3)).toEqual([
      12.5,
      true,
      "2026-09-06",
    ]);
    expect(
      pages[0].database_schema?.at(-1)?.options?.map((option) => option.name),
    ).toEqual(["Design", "Product"]);
  });
  it("retains nested databases inside entry pages", () => {
    const nested =
      entry.slice(0, -3) + "/Tasks bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const prepared = readDatabaseArchive(
      zip({
        [db + ".csv"]: "Name\nKickoff",
        [entry]: "# Kickoff\n\nBody",
        [nested + ".csv"]: "Name,Done\nTask,Yes",
        [nested + "/Task cccccccccccccccccccccccccccccccc.md"]:
          "# Task\n\nNested entry body",
      }),
      "notion.zip",
    );
    const source = prepared.sources[0];
    const pages = prepareImportPages(
      prepared,
      source,
      source.columns,
      new Map(),
    );
    expect(pages).toHaveLength(4);
    const nestedDatabase = pages.find((page) => page.id === nested + ".csv")!;
    expect(nestedDatabase.database_schema?.[0].type).toBe("checkbox");
    expect(nestedDatabase.parent_id).toBe(entry);
    expect(pages.at(-1)?.markdown).toContain("Nested entry body");
  });
  it("reads quoted multiline cells, BOMs, empty cells, and custom title headers", () => {
    const prepared = readDatabaseArchive(
      strToU8(
        '\ufeffRecord,Notes,Amount\r\nOne,"First line\nSecond, line",\r\nTwo,,0',
      ),
      "data.csv",
    );
    const source = prepared.sources[0];
    const pages = prepareImportPages(
      prepared,
      source,
      source.columns,
      new Map(),
    );
    expect(source.columns[0].type).toBe("title");
    expect(Object.values(pages[1].property_values)).toEqual([
      "First line\nSecond, line",
      null,
    ]);
    expect(Object.values(pages[2].property_values)).toEqual([null, 0]);
  });
  it("keeps unsupported values as text and refuses lossy user mappings", () => {
    expect(
      inferColumns(
        ["Name", "Formula", "Relation"],
        [["One", "3 weeks", "Two (abc)"]],
      ).map((column) => column.type),
    ).toEqual(["title", "text", "text"]);
    expect(() =>
      importCell(
        "not a number",
        { id: "n", name: "Amount", type: "number" },
        new Map(),
      ),
    ).toThrow("importInvalidMapping");
    expect(() =>
      importCell(
        "Unknown",
        { id: "p", name: "Owner", type: "people" },
        new Map(),
      ),
    ).toThrow("importUnmatchedPeople");
    expect(() => mappedColumns([{ name: "A", type: "text" }], [])).toThrow(
      "importInvalidMapping",
    );
  });
  it("does not silently discard ambiguous duplicate-title documents", () => {
    const prepared = readDatabaseArchive(
      zip({
        [db + ".csv"]: "Name\nSame\nSame",
        [db + "/Same aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.md"]:
          "# Same\nFirst body",
        [db + "/Same bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.md"]:
          "# Same\nSecond body",
      }),
      "notion.zip",
    );
    const source = prepared.sources[0];
    const pages = prepareImportPages(
      prepared,
      source,
      source.columns,
      new Map(),
    );
    expect(
      pages.filter((page) => page.markdown?.includes("body")),
    ).toHaveLength(2);
  });
  it("selects complete CSV exports and unwraps nested Notion ZIPs", () => {
    const inner = zip({
      [db + ".csv"]: "Name\nVisible",
      [db + "_all.csv"]: "Name\nVisible\nHidden",
    });
    const prepared = readDatabaseArchive(
      zipSync({ "Export/Part-1.zip": inner }),
      "export.zip",
    );
    expect(prepared.sources).toHaveLength(1);
    expect(prepared.sources[0].rows).toHaveLength(2);
  });
  it("refuses invalid archives, traversal, oversized expansion, and missing databases", () => {
    expect(() => readDatabaseArchive(strToU8("not a zip"), "data.zip")).toThrow(
      "importInvalidArchive",
    );
    expect(() =>
      readDatabaseArchive(zip({ "../outside.csv": "Name\nOne" }), "data.zip"),
    ).toThrow("importInvalidArchive");
    expect(() =>
      readDatabaseArchive(
        zipSync({ "huge.csv": new Uint8Array(51 * 1024 * 1024) }),
        "data.zip",
      ),
    ).toThrow("importTooLarge");
    expect(() =>
      readDatabaseArchive(zip({ "Only.md": "# Page" }), "data.zip"),
    ).toThrow("importNoDatabase");
  });
  it("rejects aliased central records and enforces the actual inflated byte count", () => {
    const aliased = forgeCentralAliases(1024 * 1024, 55);
    expect(aliased.byteLength).toBeLessThan(2 * 1024 * 1024);
    expect(() => readDatabaseArchive(aliased, "aliases.zip")).toThrow(
      "importInvalidArchive",
    );

    const forgedBomb = forgeSmallExpandedSize(
      zipSync(
        { "huge.csv": new Uint8Array(51 * 1024 * 1024) },
        { level: 9 },
      ),
    );
    expect(() => readDatabaseArchive(forgedBomb, "bomb.zip")).toThrow(
      "importTooLarge",
    );
  });
  it("bounds the number of CSV sources before nested-source analysis", () => {
    const files = Object.fromEntries(
      Array.from({ length: MAX_IMPORT_SOURCES + 1 }, (_, index) => [
        `database-${index}.csv`,
        "Name\nOne",
      ]),
    );
    expect(() => readDatabaseArchive(zip(files), "many-databases.zip")).toThrow(
      "importTooLarge",
    );
  });
  it("resolves encoded local links without escaping the archive", () => {
    expect(resolveArchiveLink("DB/Entry.md", "Entry%20files/image.png")).toBe(
      "DB/Entry files/image.png",
    );
    expect(resolveArchiveLink("DB/Entry.md", "../../secret")).toBeNull();
    expect(resolveArchiveLink("DB/Entry.md", "https://example.com")).toBeNull();
  });
});

describe("native database archives", () => {
  it("preserves schema option identities/colors, explicit empty values, timestamps, bodies, and nested databases", () => {
    const schema = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Status",
        type: "select",
        options: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Ready",
            color: "#123456",
          },
        ],
      },
    ];
    const root = {
      id: "db",
      parent_id: null,
      title: "Journal",
      icon: "📘",
      database_schema: schema,
      database_title_name: "Record",
      property_values: {},
      created_at: "2026-09-06T12:00:00Z",
      content: null,
      position: "0",
    };
    const row = {
      ...root,
      id: "row",
      parent_id: "db",
      database_schema: null,
      title: "Entry",
      property_values: { [schema[0].id]: null },
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Body" }] },
        ],
      },
    };
    const manifest = {
      format: "minddy-database",
      version: 1,
      pages: [root, row],
      files: [],
      people: [],
    };
    const prepared = readDatabaseArchive(
      zip({
        "minddy-database.json": JSON.stringify(manifest),
        "Journal.csv": "Name\nLossy projection",
      }),
      "database.zip",
    );
    expect(prepared.sources).toHaveLength(1);
    expect(
      prepareImportPages(prepared, prepared.sources[0], [], new Map()),
    ).toEqual(manifest.pages);
  });
  it("refuses an unsupported native archive version instead of falling back to CSV", () => {
    expect(() =>
      readDatabaseArchive(
        zip({
          "minddy-database.json": JSON.stringify({
            format: "minddy-database",
            version: 99,
            pages: [],
            files: [],
            people: [],
          }),
          "data.csv": "Name\nOne",
        }),
        "database.zip",
      ),
    ).toThrow("importInvalidArchive");
  });
  it("bounds native file operations and rejects ambiguous identities or paths", () => {
    const page = {
      id: "db",
      parent_id: null,
      title: "Journal",
      icon: null,
      database_schema: [],
      database_title_name: "Name",
      property_values: {},
      created_at: "2026-09-06T12:00:00Z",
      content: null,
      position: "0",
    };
    const manifest = (files: unknown[]) => ({
      format: "minddy-database",
      version: 1,
      pages: [page],
      files,
      people: [],
    });
    const file = (index: number, path = `files/${index}.bin`) => ({
      id: `file-${index}`,
      page_id: "db",
      path,
      file_name: `${index}.bin`,
      mime_type: "application/octet-stream",
    });

    expect(() =>
      readDatabaseArchive(
        zip({
          "minddy-database.json": JSON.stringify(
            manifest(
              Array.from({ length: MAX_IMPORT_FILES + 1 }, (_, index) =>
                file(index),
              ),
            ),
          ),
        }),
        "too-many-files.zip",
      ),
    ).toThrow("importInvalidArchive");

    for (const files of [
      [file(1, "files/shared.bin"), file(2, "files/shared.bin")],
      [file(1), { ...file(2), id: "file-1" }],
    ]) {
      expect(() =>
        readDatabaseArchive(
          zip({
            "minddy-database.json": JSON.stringify(manifest(files)),
            "files/shared.bin": "payload",
            "files/1.bin": "payload",
            "files/2.bin": "payload",
          }),
          "ambiguous-files.zip",
        ),
      ).toThrow("importInvalidArchive");
    }
  });
});
