import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { pageFileUrl } from "@/lib/page-files";
import {
  createPageFile,
  PageFileError,
  sweepOrphanPageFiles,
} from "@/lib/server/page-files";

/**
 * MIN-280 — sending connected without its HOUSEHOLD is the only real possible fault
 * here, and it is the one that is never seen: the bucket grows with images that
 * no document shows anymore, without an error line, without a screen that
 * change.
 *
 * This file plays both halves on a fake Supabase in memory — only the OUTPUT of the process is simulated (the storage, PostgREST), the real module on top.
 * Three properties are pinned to it, and each is a byte or line that
 * would survive otherwise:
 *
 * - a sending whose LINE fails erases its object, otherwise it is born an orphan;
 * - scanning ONLY deletes what no body no longer cites — a file
 * still displayed, nested in a leaflet, must remain;
 * - and the line leaves BEFORE the bytes, never the other way around: in the other order,
 * a failure leaves a line which names an object missing, therefore a dead block.
 */

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/* ── The fake Supabase ─────────────────────────── ──────────────────────────── */

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
  /** Fail row insertion — the only catch-up branch. */
  insertFails?: boolean;
  /** Compte plein : ce que rend `project_storage_quota_ok` (MIN-348). */
  quotaOk?: boolean;
} = {}) {
  const files = options.files ?? [];
  const pages = options.pages ?? [];
  const uploaded: string[] = [];
  const removed: string[] = [];
  /** The REAL order of gestures, to slice “the line before the bytes”. */
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
        // MIN-343: bucket cleaning first asks who is still referencing the
        // path. LIVING lines respond — that's what makes order
        // “line first, bytes later” observable here.
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
    // The other table that references the bucket: no ticket resources here.
    if (table === "attachments") {
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    }
    throw new Error(`table inattendue: ${table}`);
  };

  // The quota verdict is in SQL; the module only knows the call.
  const rpc = async (name: string) => {
    if (name !== "project_storage_quota_ok") throw new Error(`rpc inattendu: ${name}`);
    return { data: options.quotaOk ?? true, error: null };
  };

  return {
    client: { from, storage, rpc } as unknown as SupabaseClient,
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
    // The name of the KEY is cleaned (the storage refuses the exotic), that of the
    // LINE keeps its spaces and its apostrophe: this is what we display.
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

  it("refuse quand le compte a rempli son quota, sans rien téléverser", async () => {
    // This writing goes through the SERVICE client, which bypasses the policy
    // where the ceiling is placed: without this relay, it would be the hole (MIN-348).
    const service = fakeService({ quotaOk: false });
    await expect(createPageFile(service.client, args)).rejects.toMatchObject({
      status: 507,
    });
    expect(service.uploaded).toEqual([]);
  });

  it("efface l'objet quand la LIGNE ne passe pas", async () => {
    // Without this catch-up, the byte exists and nothing says which page it is on
    // belonged: even the scanning of orphans, which starts from the lines, does not
    // couldn't find him anymore.
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

/* ── Housekeeping ─────────────────────────────── ─────────────────────────────── */

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

/** A body that cites `cited`, including a file EMBEDDED in a leaflet. */
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
  // Real identifiers: this is the FORM of the URL that the scanning recognizes
  // in a body (lib/page-files.ts), and a bogus id would not be found there —
  // the test would then pass for the wrong reason, erasing everything.
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

  it("deletes the ROW before the bytes", async () => {
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
    // Its lines have already left through the waterfall at the time of the purge; those
    // that we see here are of a page purged between two scans.
    const service = fakeService({ files: [row(VEUF)], pages: [] });
    expect(await sweepOrphanPageFiles(service.client, LATER)).toBe(1);
    expect(service.removed).toHaveLength(1);
  });

  it("spares what has not passed the grace period", async () => {
    // A file sent an hour ago is not yet in a body
    // SAVED: the autosave did not necessarily write. Deleting it would
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

  it("does nothing when there are no candidates", async () => {
    const service = fakeService();
    const spy = vi.spyOn(service.client, "from");
    expect(await sweepOrphanPageFiles(service.client, LATER)).toBe(0);
    // Only one request: the bodies are not even read.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
