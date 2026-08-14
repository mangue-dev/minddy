import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { pageFileUrl } from "@/lib/page-files";
import {
  createPageFile,
  PageFileError,
  sweepOrphanPageFiles,
} from "@/lib/server/page-files";

/**
 * MIN-280 — un envoi branché sans son MÉNAGE est la seule vraie faute possible
 * ici, et c'est celle qui ne se voit jamais : le bucket grossit d'images que
 * plus aucun document ne montre, sans une ligne d'erreur, sans un écran qui
 * change.
 *
 * Ce fichier joue les deux moitiés sur un faux Supabase en mémoire — seul ce qui
 * SORT du process est simulé (le storage, PostgREST), le vrai module par-dessus.
 * Trois propriétés y sont épinglées, et chacune est un octet ou une ligne qui
 * survivrait autrement :
 *
 *  - un envoi dont la LIGNE échoue efface son objet, sinon il naît orphelin ;
 *  - le balayage ne supprime QUE ce qu'aucun corps ne cite plus — un fichier
 *    encore affiché, imbriqué dans un dépliant, doit rester ;
 *  - et la ligne part AVANT les octets, jamais l'inverse : dans l'autre ordre,
 *    un échec laisse une ligne qui nomme un objet disparu, donc un bloc mort.
 */

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/* ── Le faux Supabase ─────────────────────────────────────────────────────── */

interface FakeRow {
  id: string;
  page_id: string;
  project_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
}

function fakeService(options: {
  files?: FakeRow[];
  pages?: { id: string; content: unknown }[];
  /** Faire échouer l'insertion de la ligne — la seule branche de rattrapage. */
  insertFails?: boolean;
} = {}) {
  const files = options.files ?? [];
  const pages = options.pages ?? [];
  const uploaded: string[] = [];
  const removed: string[] = [];
  /** L'ordre RÉEL des gestes, pour trancher « la ligne avant les octets ». */
  const order: string[] = [];

  const storage = {
    from: () => ({
      upload: async (path: string) => {
        uploaded.push(path);
        order.push(`upload:${path}`);
        return { error: null };
      },
      remove: async (paths: string[]) => {
        removed.push(...paths);
        order.push(`remove:${paths.join(",")}`);
        return { error: null };
      },
    }),
  };

  const from = (table: string) => {
    if (table === "page_files") {
      const filters: { before?: string } = {};
      const query = {
        select: () => query,
        lt: (_column: string, value: string) => {
          filters.before = value;
          return query;
        },
        // MIN-343 : le ménage du bucket demande d'abord qui référence encore le
        // chemin. Les lignes VIVANTES répondent — c'est ce qui rend l'ordre
        // « la ligne d'abord, les octets ensuite » observable ici.
        in: async (_column: string, paths: string[]) => ({
          data: files
            .filter((f) => paths.includes(f.storage_path))
            .map((f) => ({ storage_path: f.storage_path })),
          error: null,
        }),
        limit: async () =>
          ({
            data: files.filter((f) =>
              filters.before ? f.created_at < filters.before : true
            ),
            error: null,
          }),
        insert: (row: Omit<FakeRow, "id" | "created_at">) => ({
          select: () => ({
            single: async () => {
              order.push("insert");
              if (options.insertFails) {
                return { data: null, error: { message: "boom" } };
              }
              const created: FakeRow = {
                ...row,
                id: "new-file",
                created_at: new Date().toISOString(),
              };
              files.push(created);
              return { data: created, error: null };
            },
          }),
        }),
        delete: () => ({
          in: async (_column: string, ids: string[]) => {
            order.push(`delete:${ids.join(",")}`);
            for (const id of ids) {
              const index = files.findIndex((f) => f.id === id);
              if (index >= 0) files.splice(index, 1);
            }
            return { count: ids.length, error: null };
          },
        }),
      };
      return query;
    }
    if (table === "pages") {
      return {
        select: () => ({
          in: async (_column: string, ids: string[]) => ({
            data: pages.filter((p) => ids.includes(p.id)),
            error: null,
          }),
        }),
      };
    }
    // L'autre table qui référence le bucket : aucune ressource de ticket ici.
    if (table === "attachments") {
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    }
    throw new Error(`table inattendue: ${table}`);
  };

  return {
    client: { from, storage } as unknown as SupabaseClient,
    files,
    uploaded,
    removed,
    order,
  };
}

/* ── L'envoi ──────────────────────────────────────────────────────────────── */

describe("createPageFile", () => {
  const args = {
    projectId: PROJECT,
    pageId: PAGE,
    createdBy: "user-1",
    fileName: "Ma capture d'écran.png",
    mimeType: "image/png",
    data: Buffer.from("des octets"),
  };

  it("range l'objet sous le préfixe du projet ET de la page", async () => {
    const service = fakeService();
    const row = await createPageFile(service.client, args);

    expect(service.uploaded).toHaveLength(1);
    expect(service.uploaded[0]).toMatch(
      new RegExp(`^projects/${PROJECT}/pages/${PAGE}/[0-9a-f-]{36}/`)
    );
    // Le nom de la CLÉ est nettoyé (le storage refuse l'exotique), celui de la
    // LIGNE garde ses espaces et son apostrophe : c'est lui qu'on affiche.
    expect(service.uploaded[0].endsWith("Ma_capture_d_cran.png")).toBe(true);
    expect(row.file_name).toBe("Ma capture d'écran.png");
    expect(row.size_bytes).toBe(args.data.byteLength);
  });

  it("refuse un fichier vide ou trop lourd, sans rien téléverser", async () => {
    const service = fakeService();
    await expect(
      createPageFile(service.client, { ...args, data: Buffer.alloc(0) })
    ).rejects.toBeInstanceOf(PageFileError);
    await expect(
      createPageFile(service.client, { ...args, data: Buffer.alloc(11 * 1024 * 1024) })
    ).rejects.toMatchObject({ status: 413 });
    expect(service.uploaded).toEqual([]);
  });

  it("efface l'objet quand la LIGNE ne passe pas", async () => {
    // Sans ce rattrapage, l'octet existe et plus rien ne dit à quelle page il
    // appartenait : même le balayage des orphelins, qui part des lignes, ne
    // pourrait plus le retrouver.
    const service = fakeService({ insertFails: true });
    await expect(createPageFile(service.client, args)).rejects.toBeInstanceOf(
      PageFileError
    );
    expect(service.removed).toEqual(service.uploaded);
  });

  it("accepte N'IMPORTE QUEL type — c'est un bloc fichier, pas un bloc image", async () => {
    const service = fakeService();
    const row = await createPageFile(service.client, {
      ...args,
      fileName: "archive.zip",
      mimeType: "application/zip",
    });
    expect(row.mime_type).toBe("application/zip");
  });

  it("retombe sur un type générique quand le navigateur n'en donne pas", async () => {
    const service = fakeService();
    const row = await createPageFile(service.client, { ...args, mimeType: "" });
    expect(row.mime_type).toBe("application/octet-stream");
  });
});

/* ── Le ménage ────────────────────────────────────────────────────────────── */

function row(id: string, pageId = PAGE): FakeRow {
  return {
    id,
    page_id: pageId,
    project_id: PROJECT,
    storage_path: `projects/${PROJECT}/pages/${pageId}/${id}/f.png`,
    file_name: "f.png",
    mime_type: "image/png",
    size_bytes: 10,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

/** Un corps qui cite `cited`, dont un fichier IMBRIQUÉ dans un dépliant. */
function body(cited: string[]) {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "du texte" }] },
      ...cited.map((id, index) =>
        index === 0
          ? { type: "image", attrs: { src: pageFileUrl(PROJECT, id) } }
          : {
              type: "details",
              content: [
                {
                  type: "detailsContent",
                  content: [
                    {
                      type: "pageFile",
                      attrs: { src: pageFileUrl(PROJECT, id), name: "f.png" },
                    },
                  ],
                },
              ],
            }
      ),
    ],
  };
}

describe("sweepOrphanPageFiles", () => {
  const LATER = "2026-02-01T00:00:00.000Z";
  // De vrais identifiants : c'est la FORME de l'URL que le balayage reconnaît
  // dans un corps (lib/page-files.ts), et un id bidon ne s'y retrouverait pas —
  // le test passerait alors pour la mauvaise raison, en effaçant tout.
  const VIVANT = "11111111-1111-4111-8111-111111111111";
  const IMBRIQUE = "22222222-2222-4222-8222-222222222222";
  const ORPHELIN = "33333333-3333-4333-8333-333333333333";
  const VEUF = "44444444-4444-4444-8444-444444444444";
  const FRAIS = "55555555-5555-4555-8555-555555555555";

  it("garde ce que le corps cite encore, effaçant tout le reste", async () => {
    const service = fakeService({
      files: [row(VIVANT), row(IMBRIQUE), row(ORPHELIN)],
      pages: [{ id: PAGE, content: body([VIVANT, IMBRIQUE]) }],
    });

    expect(await sweepOrphanPageFiles(service.client, LATER)).toBe(1);
    expect(service.removed).toEqual([
      `projects/${PROJECT}/pages/${PAGE}/${ORPHELIN}/f.png`,
    ]);
    expect(service.files.map((f) => f.id)).toEqual([VIVANT, IMBRIQUE]);
  });

  it("supprime la LIGNE avant les octets", async () => {
    const service = fakeService({
      files: [row(ORPHELIN)],
      pages: [{ id: PAGE, content: body([]) }],
    });
    await sweepOrphanPageFiles(service.client, LATER);
    expect(service.order.map((step) => step.split(":")[0])).toEqual([
      "delete",
      "remove",
    ]);
  });

  it("emporte les fichiers d'une page qui n'existe plus", async () => {
    // Ses lignes sont déjà parties par la cascade au moment de la purge ; celles
    // qu'on voit ici sont d'une page purgée entre deux balayages.
    const service = fakeService({ files: [row(VEUF)], pages: [] });
    expect(await sweepOrphanPageFiles(service.client, LATER)).toBe(1);
    expect(service.removed).toHaveLength(1);
  });

  it("épargne ce qui n'a pas passé le délai de grâce", async () => {
    // Un fichier envoyé il y a une heure n'est pas encore dans un corps
    // ENREGISTRÉ : l'autosave n'a pas forcément écrit. Le supprimer serait
    // effacer l'image qu'on vient de coller.
    const service = fakeService({
      files: [row(FRAIS)],
      pages: [{ id: PAGE, content: body([]) }],
    });
    expect(
      await sweepOrphanPageFiles(service.client, "2025-01-01T00:00:00.000Z")
    ).toBe(0);
    expect(service.removed).toEqual([]);
  });

  it("ne touche à rien quand il n'y a aucun candidat", async () => {
    const service = fakeService();
    const spy = vi.spyOn(service.client, "from");
    expect(await sweepOrphanPageFiles(service.client, LATER)).toBe(0);
    // Une seule requête : les corps ne sont même pas lus.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
