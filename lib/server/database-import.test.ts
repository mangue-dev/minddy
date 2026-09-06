import { beforeEach, expect, it, vi } from "vitest";
import { zipSync, strToU8 } from "fflate";
import type { ImportPage } from "@/lib/database-import/types";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: h.rpc,
  }),
}));
vi.mock("@/lib/server/import-context", () => ({ loadImportContext: async () => ({ members: [] }) }));
vi.mock("@/lib/server/storage-quota", () => ({ projectStorageAllowed: async () => true }));
vi.mock("@/lib/server/page-links", () => ({ queuePageBodyLinks: vi.fn() }));
vi.mock("@/lib/server/pages-search", () => ({ queueSearchText: vi.fn() }));
import { importDatabase } from "./database-import";

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: { count: 3, replayed: false }, error: null });
});

const args = {
  projectId: "49991390-0000-4000-8000-000000000001",
  pageId: "49991390-0000-4000-8000-000000000002",
  actorId: "49991390-0000-4000-8000-000000000003",
  requestId: "49991390-0000-4000-8000-000000000004",
  revision: 0, people: {}, filename: "database.zip",
  columns: [{ name: "Name", type: "title" as const }],
};

it.each([
  { extension: ".csv", introduction: false },
  { extension: "_all.csv", introduction: false },
  { extension: ".csv", introduction: true },
  { extension: "_all.csv", introduction: true },
  { extension: ".CSV", introduction: true },
])("rewrites imported database links with $extension and introduction=$introduction", async ({ extension, introduction }) => {
  const database = "Journal aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const entryName = "Entry bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const nestedName = "Tasks cccccccccccccccccccccccccccccccc";
  const entry = `${database}/${entryName}`;
  const nested = `${entry}/${nestedName}`;
  const href = (path: string) => encodeURI(path);
  const links = [
    `[Database](${href(`../${database}${extension}`)})`,
    `[Tasks](${href(`${entryName}/${nestedName}${extension}`)})`,
    `[Tasks view](${href(`${entryName}/${nestedName}.csv`)})`,
    `[All tasks](${href(`${entryName}/${nestedName}_all.csv`)})`,
    "[Unimported](../Other.csv)",
    "[External](https://example.test/Tasks.csv)",
    ...(introduction ? [`[Introduction](${href(`${entryName}/${nestedName}.md`)})`] : []),
  ];
  const files: Record<string, Uint8Array> = {
    [`${database}${extension}`]: strToU8("Name\nEntry"),
    [`${entry}.md`]: strToU8(`# Entry\n\n${links.join("\n\n")}`),
    [`${nested}${extension}`]: strToU8("Name\nTask"),
    [`${nested}/Task dddddddddddddddddddddddddddddddd.md`]: strToU8("# Task\n\nBody"),
    "Other.csv": strToU8("Name\nUnimported"),
  };
  if (introduction) files[`${nested}.md`] = strToU8("# Tasks\n\nIntroduction");
  if (extension === "_all.csv") files[`${nested}.csv`] = strToU8("Name\nTask");
  await importDatabase({ ...args, bytes: zipSync(files), sourceId: `${database}${extension}` });
  const pages = h.rpc.mock.calls[0][1].p_pages as ImportPage[];
  const importedEntry = pages.find((page) => page.title === "Entry")!;
  const importedDatabase = pages.find((page) => page.title === "Tasks")!;
  expect(importedDatabase.database_schema).not.toBeNull();
  expect(importedDatabase.parent_id).toBe(importedEntry.id);
  const linkTargets: string[] = [];
  JSON.stringify(importedEntry.content, (key, value) => {
    if (key === "href") linkTargets.push(value);
    return value;
  });
  const nestedUrl = `/projects/${args.projectId}/pages/${importedDatabase.id}`;
  expect(linkTargets).toEqual([
    `/projects/${args.projectId}/pages/${args.pageId}`,
    nestedUrl, nestedUrl, nestedUrl,
    "../Other.csv", "https://example.test/Tasks.csv",
    ...(introduction ? [nestedUrl] : []),
  ]);
  expect(pages.some((page) => page.title === "Other")).toBe(false);
});
