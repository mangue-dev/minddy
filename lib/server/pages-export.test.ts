import { describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

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
  },
  list: [] as Array<Record<string, unknown>>,
};

let access: unknown = { isOwner: true };

/** What the base was asked to return — the object of MIN-348's control: the
    project list does NOT ask for bodies, and these are only read for
    branche. */
const reads = { selects: [] as string[], bodyIds: [] as string[][] };

vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => access,
}));

vi.mock("@/lib/server/pages-projection", () => ({
  pageToMarkdownServer: async (page: { title: string }) =>
    `# ${page.title}\n\ncorps de ${page.title}`,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: (columns: string) => {
        reads.selects.push(columns);
        return {
          eq: (column: string) =>
            column === "id"
              ? { is: () => ({ maybeSingle: async () => ({ data: rows.root }) }) }
              : {
                  is: () => ({
                    order: async () => ({ data: rows.list, error: null }),
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
    const result = await exportPage({ pageId: "root", actorId: "u", branch: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe("Guide.md");
    expect(result.contentType).toContain("text/markdown");
    expect(strFromU8(result.body)).toContain("# Guide");
  });

  it("rend une archive relisible, bornée à la branche", async () => {
    access = { isOwner: true };
    rows.list = branchRows();
    const result = await exportPage({ pageId: "root", actorId: "u", branch: true });
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
    expect(Object.keys(entries).every((p) => p.startsWith("Guide/"))).toBe(true);
  });

  it("ne charge le corps que des pages de la branche", async () => {
    access = { isOwner: true };
    rows.list = branchRows();
    reads.selects = [];
    reads.bodyIds = [];
    const result = await exportPage({ pageId: "root", actorId: "u", branch: true });
    expect(result.ok).toBe(true);

    // The project list is a SKELETON: without it, export a page from a
    // wiki de mille documents en chargeait mille corps (MIN-348).
    const listSelect = reads.selects.find(
      (s) => s.includes("parent_id") && !s.includes("project_id")
    );
    expect(listSelect).toBeDefined();
    expect(listSelect).not.toContain("content");
    // And the bodies requested are those of the branch, except the root (it
    // is already read). The neighbor is not there.
    expect(reads.bodyIds.flat()).toEqual(["kid"]);
  });

  it("répond 404 à qui n'a pas accès au projet — jamais 403", async () => {
    access = null;
    const result = await exportPage({ pageId: "root", actorId: "u", branch: false });
    expect(result).toEqual({ ok: false, status: 404, errorKey: "pageNotFound" });
  });
});
