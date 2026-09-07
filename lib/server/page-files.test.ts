import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { pageFileUrl } from "@/lib/page-files";
import {
  createPageFile,
  PageFileError,
  sweepOrphanPageFiles,
} from "@/lib/server/page-files";

/**
 * MIN-280 verifies both sides of the page-file lifecycle against an in-memory
 * Supabase double. A failed metadata insert must remove the uploaded object;
 * sweeping must keep every object still cited by page content; and cleanup must
 * delete the metadata row before its bytes so a Storage failure cannot leave a
 * live row pointing at a missing object.
 */

const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/* ── In-memory Supabase double ─────────────────────────────────────────────── */

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
  /** Fail row insertion to exercise upload rollback. */
  insertFails?: boolean;
  /** Whether the exact pending upload fits the account quota (MIN-348). */
  quotaOk?: boolean;
} = {}) {
  const files = options.files ?? [];
  const pages = options.pages ?? [];
  const uploaded: string[] = [];
  const removed: string[] = [];
  /** Actual operation order, used to assert row deletion precedes byte deletion. */
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
        // MIN-343: bucket cleanup first asks which live rows still reference
        // each path, making row-before-object deletion observable here.
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
    // Attachments are the other table that can reference this bucket.
    if (table === "attachments") {
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    }
    throw new Error(`table inattendue: ${table}`);
  };

  // SQL owns the quota verdict; the module only calls the RPC.
  const rpc = async (name: string) => {
    if (name !== "project_storage_quota_allows")
      throw new Error(`unexpected rpc: ${name}`);
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

/* ── Upload ───────────────────────────────────────────────────────────────── */

describe("createPageFile", () => {
  const args = {
    projectId: PROJECT,
    pageId: PAGE,
    createdBy: "user-1",
    fileName: "Ma capture d'écran.png",
    mimeType: "image/png",
    data: Buffer.from("des octets"),
  };

  it("stores the object under both the project and page prefixes", async () => {
    const service = fakeService();
    const row = await createPageFile(service.client, args);

    expect(service.uploaded).toHaveLength(1);
    expect(service.uploaded[0]).toMatch(
      new RegExp(`^projects/${PROJECT}/pages/${PAGE}/[0-9a-f-]{36}/`)
    );
    // The object key is sanitized for Storage, while the row keeps the original
    // display name with its spaces and apostrophe.
    expect(service.uploaded[0].endsWith("Ma_capture_d_cran.png")).toBe(true);
    expect(row.file_name).toBe("Ma capture d'écran.png");
    expect(row.size_bytes).toBe(args.data.byteLength);
  });

  it("rejects empty and oversized files without uploading", async () => {
    const service = fakeService();
    await expect(
      createPageFile(service.client, { ...args, data: Buffer.alloc(0) })
    ).rejects.toBeInstanceOf(PageFileError);
    await expect(
      createPageFile(service.client, { ...args, data: Buffer.alloc(11 * 1024 * 1024) })
    ).rejects.toMatchObject({ status: 413 });
    expect(service.uploaded).toEqual([]);
  });

  it("rejects a full account quota without uploading", async () => {
    // This write uses the service client and therefore needs an explicit quota
    // check before it reaches Storage (MIN-348).
    const service = fakeService({ quotaOk: false });
    await expect(createPageFile(service.client, args)).rejects.toMatchObject({
      status: 507,
    });
    expect(service.uploaded).toEqual([]);
  });

  it("removes the object when metadata insertion fails", async () => {
    // Without rollback, the bucket would retain bytes that no metadata row can
    // associate with a page.
    const service = fakeService({ insertFails: true });
    await expect(createPageFile(service.client, args)).rejects.toBeInstanceOf(
      PageFileError
    );
    expect(service.removed).toEqual(service.uploaded);
  });

  it("accepts any MIME type because this is a file block", async () => {
    const service = fakeService();
    const row = await createPageFile(service.client, {
      ...args,
      fileName: "archive.zip",
      mimeType: "application/zip",
    });
    expect(row.mime_type).toBe("application/zip");
  });

  it("uses a generic type when the browser provides none", async () => {
    const service = fakeService();
    const row = await createPageFile(service.client, { ...args, mimeType: "" });
    expect(row.mime_type).toBe("application/octet-stream");
  });
});

/* ── Housekeeping ──────────────────────────────────────────────────────────── */

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

/** Page content that cites `cited`, including a file nested in a callout. */
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
  // Real UUIDs preserve the URL shape that the production scanner recognizes.
  const VIVANT = "11111111-1111-4111-8111-111111111111";
  const IMBRIQUE = "22222222-2222-4222-8222-222222222222";
  const ORPHELIN = "33333333-3333-4333-8333-333333333333";
  const VEUF = "44444444-4444-4444-8444-444444444444";
  const FRAIS = "55555555-5555-4555-8555-555555555555";

  it("keeps objects still cited by content and removes the rest", async () => {
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

  it("deletes the row before the bytes", async () => {
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

  it("removes files whose page no longer exists", async () => {
    // Cascades may have removed the rows before the next object sweep.
    const service = fakeService({ files: [row(VEUF)], pages: [] });
    expect(await sweepOrphanPageFiles(service.client, LATER)).toBe(1);
    expect(service.removed).toHaveLength(1);
  });

  it("spares what has not passed the grace period", async () => {
    // A recently uploaded file may not appear in persisted content until the
    // next autosave, so the grace period must protect it.
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
    // No candidates means page bodies do not need to be read.
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
