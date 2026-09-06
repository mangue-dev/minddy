import { beforeEach, expect, it, vi } from "vitest";
import { strFromU8, strToU8 } from "fflate";
import type { ImportPage } from "@/lib/database-import/types";

const fixtures = vi.hoisted(() => ({
  files: [] as Array<{
    id: string;
    page_id: string;
    file_name: string;
    mime_type: string;
    storage_path: string;
  }>,
  downloadError: false,
  ranges: [] as number[],
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({
              range: async (start: number, end: number) => {
                fixtures.ranges.push(start);
                return {
                  data: fixtures.files.slice(start, end + 1),
                  error: null,
                };
              },
            }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        download: async () => ({
          data: fixtures.downloadError
            ? null
            : new Blob(["Exact attachment bytes"]),
          error: fixtures.downloadError ? new Error("Download failed") : null,
        }),
      }),
    },
  }),
}));

const { databaseArchiveFiles } = await import("./database-export");
const page: ImportPage = {
  id: "db",
  parent_id: null,
  title: "Journal",
  icon: null,
  database_schema: [],
  database_title_name: "Entry",
  property_values: {},
  position: "a0",
};
const paths = new Map([["db", "Journal/index.md"]]);
beforeEach(() => {
  fixtures.files = [
    {
      id: "file",
      page_id: "db",
      file_name: "notes.txt",
      mime_type: "text/plain",
      storage_path: "stored/file",
    },
  ];
  fixtures.downloadError = false;
  fixtures.ranges = [];
});

it("keeps attachment bytes and rewrites both absolute and relative file links for offline reading", async () => {
  const entries = await databaseArchiveFiles(
    [page],
    paths,
    new Map(),
    {
      "Journal/index.md": strToU8(
        "[Relative](/api/projects/proj/pages/files/file)\n[Absolute](https://minddy.app/api/projects/proj/pages/files/file)",
      ),
    },
    "proj",
  );
  expect(strFromU8(entries["__minddy_files__/file/notes.txt"])).toBe(
    "Exact attachment bytes",
  );
  const markdown = strFromU8(entries["Journal/index.md"]);
  expect(markdown).toBe(
    "[Relative](../__minddy_files__/file/notes.txt)\n[Absolute](../__minddy_files__/file/notes.txt)",
  );
  const manifest = JSON.parse(strFromU8(entries["minddy-database.json"]));
  expect(manifest.pages).toEqual([page]);
  expect(manifest.files[0]).toMatchObject({
    id: "file",
    page_id: "db",
    path: "__minddy_files__/file/notes.txt",
  });
});

it("includes attachments beyond the first metadata batch", async () => {
  const file = fixtures.files[0];
  fixtures.files = Array.from({ length: 501 }, (_, index) => ({
    ...file,
    id: `file-${index}`,
  }));
  const entries = await databaseArchiveFiles(
    [page],
    paths,
    new Map(),
    {},
    "proj",
  );
  expect(fixtures.ranges).toEqual([0, 500]);
  expect(
    JSON.parse(strFromU8(entries["minddy-database.json"])).files,
  ).toHaveLength(501);
  expect(entries["__minddy_files__/file-500/notes.txt"]).toBeDefined();
});

it("fails the export if an attachment cannot be downloaded instead of producing an incomplete archive", async () => {
  fixtures.downloadError = true;
  await expect(
    databaseArchiveFiles([page], paths, new Map(), {}, "proj"),
  ).rejects.toThrow("Could not export database file");
});
