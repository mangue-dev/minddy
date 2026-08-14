import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { insertAttachments, ResourceScopeError } = await import("./attachments");

/**
 * MIN-275 — la garde de périmètre d'une ressource PAGE.
 *
 * `parseResourcesInput` valide des FORMES : il ne peut pas savoir si le
 * `page_id` qu'on lui donne désigne une page de ce projet-là. C'est le seul
 * point d'écriture qui le sait, et c'est donc là que ça se vérifie — routes,
 * création de ticket, MCP, Numo et import y passent tous.
 *
 * Ce qui compte ici est aussi ce qui est REFUSÉ : une page d'un autre projet
 * serait une citation illisible pour l'équipe qui la reçoit, et une page à la
 * corbeille une pilule inerte dès sa naissance.
 */

const PROJECT = "11111111-1111-4111-8111-111111111111";
const PAGE = "22222222-2222-4222-8222-222222222222";

/** Client Supabase de service, réduit à ce que la garde en appelle : le select
    des pages vivantes du projet, et l'insert. */
function fakeService(livePageIds: string[]) {
  const inserted: Record<string, unknown>[][] = [];
  const pagesFilters: Record<string, unknown> = {};

  const client = {
    // MIN-343 : l'insert demande aussi au storage qui a téléversé les fichiers
    // du lot. Aucun téléverseur connu ici — ce fichier-ci parle des pages.
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      if (table === "pages") {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (col: string, value: unknown) => {
            pagesFilters[col] = value;
            return builder;
          },
          is: (col: string, value: unknown) => {
            pagesFilters[col] = value;
            return builder;
          },
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids
                .filter((id) => livePageIds.includes(id))
                .map((id) => ({ id })),
              error: null,
            }),
        };
        return builder;
      }
      return {
        insert(rows: Record<string, unknown>[]) {
          inserted.push(rows);
          return {
            select: () =>
              Promise.resolve({
                data: rows.map((r, i) => ({ id: `row-${i}`, ...r })),
                error: null,
              }),
          };
        },
      };
    },
  };

  return { client, inserted, pagesFilters };
}

const parent = {
  projectId: PROJECT,
  issueId: "33333333-3333-4333-8333-333333333333",
  commentId: null,
  createdBy: null,
};

describe("insertAttachments — une ressource page", () => {
  it("écrit la ligne quand la page est une page vivante du projet", async () => {
    const { client, inserted, pagesFilters } = fakeService([PAGE]);
    const rows = await insertAttachments(client as never, {
      ...parent,
      resources: [{ kind: "page", page_id: PAGE, file_name: "Spec" }],
    });

    // Le contrôle porte sur LE projet du parent, et ignore la corbeille.
    expect(pagesFilters.project_id).toBe(PROJECT);
    expect(pagesFilters.deleted_at).toBeNull();
    expect(rows).toHaveLength(1);
    expect(inserted[0][0]).toMatchObject({
      kind: "page",
      page_id: PAGE,
      storage_path: null,
      url: null,
      size_bytes: 0,
      file_name: "Spec",
    });
  });

  it("refuse une page d'un autre projet, sans rien écrire", async () => {
    const { client, inserted } = fakeService([]);
    await expect(
      insertAttachments(client as never, {
        ...parent,
        resources: [{ kind: "page", page_id: PAGE, file_name: "Spec" }],
      })
    ).rejects.toBeInstanceOf(ResourceScopeError);
    expect(inserted).toHaveLength(0);
  });

  it("refuse le LOT entier quand une seule page cloche", async () => {
    // Même politique que `parseResourcesInput` : enregistrer le reste ferait
    // disparaître une ressource sans que personne ne l'apprenne.
    const { client, inserted } = fakeService([PAGE]);
    await expect(
      insertAttachments(client as never, {
        ...parent,
        resources: [
          { kind: "page", page_id: PAGE, file_name: "Spec" },
          {
            kind: "page",
            page_id: "44444444-4444-4444-8444-444444444444",
            file_name: "Ailleurs",
          },
        ],
      })
    ).rejects.toBeInstanceOf(ResourceScopeError);
    expect(inserted).toHaveLength(0);
  });

  it("ne consulte pas les pages quand aucune ressource n'en est une", async () => {
    const { client, pagesFilters, inserted } = fakeService([]);
    await insertAttachments(client as never, {
      ...parent,
      resources: [
        {
          storage_path: `projects/${PROJECT}/a/capture.png`,
          file_name: "capture.png",
          mime_type: "image/png",
          size_bytes: 12,
        },
      ],
    });
    expect(pagesFilters).toEqual({});
    expect(inserted[0][0]).toMatchObject({ kind: "file", page_id: null });
  });
});
