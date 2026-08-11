import { describe, expect, it, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

/**
 * MIN-283 — l'export, du côté qui touche à la base : ce qui part vraiment dans
 * l'archive, et ce qui n'y part pas.
 *
 * La projection markdown est stubbée : ce n'est pas elle qu'on teste ici (MIN-269
 * la joue bloc par bloc, aller-retour compris), c'est le CHAÎNAGE — la branche
 * retenue, la corbeille exclue, l'archive relue.
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
      select: () => ({
        eq: (column: string) =>
          column === "id"
            ? { is: () => ({ maybeSingle: async () => ({ data: rows.root }) }) }
            : {
                is: () => ({
                  order: async () => ({ data: rows.list, error: null }),
                }),
              },
      }),
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
    // Une page d'une AUTRE branche du même projet : elle ne doit pas suivre.
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

    // Relue : c'est le seul contrôle qui prouve qu'on a produit un vrai zip.
    const entries = unzipSync(result.body);
    expect(Object.keys(entries).sort()).toEqual([
      "Guide/Intro.md",
      "Guide/index.md",
    ]);
    expect(strFromU8(entries["Guide/index.md"])).toContain("corps de Guide");
    // La racine de l'archive est la page exportée : son parent réel, qui n'est
    // pas de la branche, ne la fait pas descendre d'un cran.
    expect(Object.keys(entries).every((p) => p.startsWith("Guide/"))).toBe(true);
  });

  it("répond 404 à qui n'a pas accès au projet — jamais 403", async () => {
    access = null;
    const result = await exportPage({ pageId: "root", actorId: "u", branch: false });
    expect(result).toEqual({ ok: false, status: 404, errorKey: "pageNotFound" });
  });
});
