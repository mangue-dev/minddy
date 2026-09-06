import { describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import MarkdownIt from "markdown-it";
import { posix } from "node:path";

/**
 * MIN-283 — export, from the side that touches the base: what really goes into
 * the archive, and what does not go there.
 *
 * The markdown projection is stubbed: it is not what we are testing here (MIN-269
 * the play block by block, round trip included), it is the CHAINING — the branch
 * retained, the trash excluded, the archive reread.
 */

const rows = {
  root: {
    id: "root",
    project_id: "proj",
    parent_id: "hors-branche",
    title: "Guide",
    icon: null,
    content: null,
    position: "a",
    created_at: "2026-09-06T12:00:00Z",
  },
  list: [] as Array<Record<string, unknown>>,
};

let access: unknown = { isOwner: true };

/** What the base was asked to return — the object of MIN-348's control: the
    project list does NOT ask for bodies, and these are only read for
    branche. */
const projections: unknown[] = [];
const reads = { selects: [] as string[], bodyIds: [] as string[][] };

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => access,
}));

vi.mock("@/lib/server/pages-projection", () => ({
  pageToMarkdownServer: vi.fn(async (page: { title: string }) => {
    projections.push(page);
    return `# ${page.title}\n\ncorps de ${page.title}`;
  }),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => table === "page_files" ? { select: () => ({ eq: () => ({ in: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }) }) } : ({
      select: (columns: string) => {
        reads.selects.push(columns);
        return {
          eq: (column: string, value: string) =>
            column === "id"
              ? {
                  is: () => ({
                    maybeSingle: async () => ({ data: rows.root }),
                  }),
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: rows.list.find((row) => row.id === value) ?? null,
                    }),
                  }),
                }
              : {
                  is: () => ({
                    order: () => ({ order: () => ({ range: async (from: number, to: number) => ({ data: rows.list.slice(from, to + 1), error: null }) }) }),
                  }),
                },
          in: async (_column: string, ids: string[]) => {
            reads.bodyIds.push(ids);
            return {
              data: rows.list.filter((p) => ids.includes(p.id as string)),
              error: null,
            };
          },
        };
      },
    }),
  }),
}));

const { exportPage } = await import("@/lib/server/pages-export");

function branchRows() {
  return [
    { ...rows.root },
    {
      id: "kid",
      parent_id: "root",
      title: "Intro",
      icon: null,
      content: null,
      position: "b",
    },
    // A page from ANOTHER branch of the same project: it should not follow.
    {
      id: "voisine",
      parent_id: "hors-branche",
      title: "Voisine",
      icon: null,
      content: null,
      position: "c",
    },
  ];
}

describe("exportPage", () => {
  it("rend un .md pour une page seule", async () => {
    access = { isOwner: true };
    const result = await exportPage({
      pageId: "root",
      actorId: "u",
      branch: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe("Guide.md");
    expect(result.contentType).toContain("text/markdown");
    expect(strFromU8(result.body)).toContain("# Guide");
  });

  it("rend une archive relisible, bornée à la branche", async () => {
    access = { isOwner: true };
    rows.list = branchRows();
    const result = await exportPage({
      pageId: "root",
      actorId: "u",
      branch: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe("Guide.zip");

    // Reread: this is the only check that proves that we have produced a real zip.
    const entries = unzipSync(result.body);
    expect(Object.keys(entries).sort()).toEqual([
      "Guide/Intro.md",
      "Guide/index.md",
    ]);
    expect(strFromU8(entries["Guide/index.md"])).toContain("corps de Guide");
    // The root of the archive is the exported page: its real parent, which is not
    // Don't take the branch, don't take it down a notch.
    expect(Object.keys(entries).every((p) => p.startsWith("Guide/"))).toBe(
      true,
    );
  });

  it("ne charge le corps que des pages de la branche", async () => {
    access = { isOwner: true };
    rows.list = branchRows();
    reads.selects = [];
    reads.bodyIds = [];
    const result = await exportPage({
      pageId: "root",
      actorId: "u",
      branch: true,
    });
    expect(result.ok).toBe(true);

    // The project list is a SKELETON: without it, export a page from a
    // wiki de mille documents en chargeait mille corps (MIN-348).
    const listSelect = reads.selects.find(
      (s) => s.includes("parent_id") && !s.includes("project_id"),
    );
    expect(listSelect).toBeDefined();
    expect(listSelect).not.toContain("content");
    // And the bodies requested are those of the branch, except the root (it
    // is already read). The neighbor is not there.
    expect(reads.bodyIds.flat()).toEqual(["kid"]);
  });

  it("répond 404 à qui n'a pas accès au projet — jamais 403", async () => {
    access = null;
    const result = await exportPage({
      pageId: "root",
      actorId: "u",
      branch: false,
    });
    expect(result).toEqual({
      ok: false,
      status: 404,
      errorKey: "pageNotFound",
    });
  });
});

it("includes creation metadata when an exported entry has no editable values", async () => {
  access = { isOwner: true };
  rows.list = [
    {
      id: rows.root.parent_id,
      parent_id: null,
      title: "Database",
      database_schema: [{ id: "created", name: "Created", type: "created_at" }],
    },
  ];
  const result = await exportPage({
    pageId: "root",
    actorId: "u",
    branch: false,
  });
  expect(result.ok).toBe(true);
  expect(JSON.stringify(projections.at(-1))).toContain(
    "Created: 2026-09-06T12:00:00Z",
  );
  expect(reads.selects.some((columns) => columns.includes("created_at"))).toBe(
    true,
  );
});

it("links database entries to existing archive files with duplicate titles and nested pages", async () => {
  access = { isOwner: true };
  rows.list = [
    { ...rows.root },
    { id: "db", parent_id: "root", title: "Journal", icon: null, position: "a", database_schema: [] },
    { id: "first", parent_id: "db", title: "Index", icon: null, position: "a" },
    { id: "second", parent_id: "db", title: "Index", icon: null, position: "b" },
    { id: "child", parent_id: "first", title: "Details", icon: null, position: "a" },
    { id: "outside", parent_id: null, title: "Private", icon: null, position: "z" },
  ];
  const projection = await import("@/lib/server/pages-projection");
  const actual = await vi.importActual<typeof projection>("@/lib/server/pages-projection");
  for (let i = 0; i < 5; i++) {
    vi.mocked(projection.pageToMarkdownServer).mockImplementationOnce(actual.pageToMarkdownServer);
  }
  const result = await exportPage({ pageId: "root", actorId: "u", branch: true });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const archive = unzipSync(result.body);
  const indexPath = "Guide/Journal/index.md";
  const markdown = strFromU8(archive[indexPath]);
  const links = new MarkdownIt().parse(markdown, {}).flatMap((token) =>
    (token.children ?? []).filter((child) => child.type === "link_open").map((child) => String(child.attrGet("href"))),
  );
  expect(links, markdown).toHaveLength(2);
  const targets = links.map((link) => posix.join(posix.dirname(indexPath), decodeURIComponent(link)));
  expect(targets).toEqual([
    "Guide/Journal/Index (2)/index.md",
    "Guide/Journal/Index (3).md",
  ]);
  for (const target of targets) expect(archive[target]).toBeDefined();
  expect(archive["Guide/Journal/Index (2)/Details.md"]).toBeDefined();
  expect(markdown).not.toContain("/projects/");
  expect(markdown).not.toContain("[[page:");
  expect(markdown).not.toContain("Private");
  const manifest = JSON.parse(strFromU8(archive["minddy-database.json"]));
  expect(manifest.pages.map((page: { id: string }) => page.id)).toEqual(["root", "db", "first", "second", "child"]);
  expect(manifest.pages.find((page: { id: string }) => page.id === "db").database_schema).toEqual([]);
  expect(archive["Guide/Journal/index.csv"]).toBeDefined();
});


it("exports the whole branch when its entries occur beyond the first project list batch", async () => {
  access = { isOwner: true };
  rows.list = [
    ...Array.from({ length: 1000 }, (_, index) => ({
      id: `outside-${index}`, parent_id: null, title: "Outside", position: "a",
    })),
    ...branchRows(),
  ];
  const result = await exportPage({ pageId: "root", actorId: "u", branch: true });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(Object.keys(unzipSync(result.body)).sort()).toEqual([
    "Guide/Intro.md", "Guide/index.md",
  ]);
});
