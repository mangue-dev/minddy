import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore, type DataKeyProvider } from "./encryption/store";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  store: null as EncryptedStore | null,
  rows: [] as Row[],
  protect: true,
  page: null as Row | null,
  refusal: null as unknown,
  member: true,
  /** Called before each view update lands, to simulate a concurrent writer. */
  beforeUpdate: null as null | (() => void),
}));
vi.mock("server-only", () => ({}));
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => h.store }));
vi.mock("./page-content", () => ({ shouldProtectPages: async () => h.protect }));
vi.mock("./pages", () => ({ pageWriteRefusal: async () => h.refusal }));
vi.mock("./project-access", () => ({ getProjectAccess: async () => h.member ? { canWrite: true } : null }));

/** An in-memory `page_database_views` table behind the query-builder calls the module uses. */
function table(name: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let action: { kind: "select" | "insert" | "update" | "delete"; values?: Row | Row[] } =
    { kind: "select" };
  const source = () => name === "pages" ? (h.page ? [h.page] : []) : h.rows;
  const matching = () => source().filter((row) => filters.every((test) => test(row)));
  const run = () => {
    if (action.kind === "insert") {
      h.rows.push(...[action.values!].flat().map((row) => ({ ...row })));
      return { data: null, error: null };
    }
    if (action.kind === "update") {
      const hook = h.beforeUpdate;
      h.beforeUpdate = null;
      hook?.();
    }
    const found = matching();
    if (action.kind === "update") found.forEach((row) => Object.assign(row, action.values));
    if (action.kind === "delete") h.rows = h.rows.filter((row) => !found.includes(row));
    return { data: found.map((row) => ({ ...row }))
      .sort((a, b) => (a.position as number) - (b.position as number)), error: null };
  };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
    is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
    order: () => builder,
    insert: (values: Row | Row[]) => { action = { kind: "insert", values }; return builder; },
    update: (values: Row) => { action = { kind: "update", values }; return builder; },
    delete: () => { action = { kind: "delete" }; return builder; },
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve(run()),
  };
  return builder;
}
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: (name: string) => table(name) }) }));

const {
  copyPageDatabaseViews,
  createPageDatabaseView,
  deletePageDatabaseView,
  listPageDatabaseViews,
  updatePageDatabaseView,
} = await import("./page-database-views");

const projectId = randomUUID();
const pageId = randomUUID();
const property = "10000000-0000-4000-8000-000000000001";
const config = { sort: property, descending: true, filter: property,
  filterValue: "confidential customer", hidden: [] as string[] };

beforeEach(() => {
  const root = randomBytes(32);
  const keys: DataKeyProvider = {
    current: async () => ({ version: 1, bytes: Buffer.from(root) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(root) }),
  };
  h.store = new EncryptedStore(keys);
  h.rows = [];
  h.protect = true;
  h.refusal = null;
  h.member = true;
  h.beforeUpdate = null;
  h.page = { id: pageId, project_id: projectId, page_is_database: true, deleted_at: null };
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("page database views", () => {
  it("seals the name and configuration, and lists them back in strip order", async () => {
    const second = await createPageDatabaseView(projectId, pageId, "actor",
      { name: "By owner", view: config, position: 2 });
    const first = await createPageDatabaseView(projectId, pageId, "actor",
      { name: "Table", view: { ...config, filterValue: "" }, position: 1 });
    expect(second.ok && first.ok).toBe(true);
    expect(JSON.stringify(h.rows)).not.toContain("confidential customer");
    expect(JSON.stringify(h.rows)).not.toContain("By owner");
    expect(h.rows.every((row) => row.name === null && row.view === null)).toBe(true);
    const listed = await listPageDatabaseViews(projectId, pageId, "reader");
    expect(listed).toMatchObject({ ok: true, page: [
      { name: "Table", position: 1 },
      { name: "By owner", position: 2, view: config },
    ] });
  });

  it("stores the view in clear when page content is not protected", async () => {
    h.protect = false;
    await createPageDatabaseView(projectId, pageId, "actor", { name: "Table", view: config });
    expect(h.rows[0]).toMatchObject({ name: "Table", view: config, encryption_version: 0 });
  });

  it("reconfigures, renames and moves a view without losing its other fields", async () => {
    const created = await createPageDatabaseView(projectId, pageId, "actor", { name: "Table", view: config });
    if (!created.ok) throw new Error("create failed");
    const id = created.page.id;
    await updatePageDatabaseView(projectId, pageId, id, "actor", { name: "Board" });
    await updatePageDatabaseView(projectId, pageId, id, "actor", { position: 7 });
    const moved = await updatePageDatabaseView(projectId, pageId, id, "actor",
      { view: { ...config, hidden: [property] } });
    expect(moved).toMatchObject({ ok: true, page: { name: "Board", position: 7,
      view: { filterValue: "confidential customer", hidden: [property] } } });
  });

  it("refuses readers, unknown pages and invalid input before any write", async () => {
    h.refusal = { ok: false, status: 403, errorKey: "readOnlyProject" };
    expect(await createPageDatabaseView(projectId, pageId, "reader", { name: "Mine", view: config }))
      .toMatchObject({ ok: false, status: 403 });
    h.refusal = null;
    expect(await createPageDatabaseView(projectId, pageId, "actor", { name: " ", view: config }))
      .toMatchObject({ ok: false, status: 400 });
    expect(await createPageDatabaseView(projectId, pageId, "actor",
      { name: "Table", view: { ...config, sort: "drop table" } })).toMatchObject({ ok: false, status: 400 });
    h.page = { id: pageId, project_id: projectId, page_is_database: false, deleted_at: null };
    expect(await listPageDatabaseViews(projectId, pageId, "actor"))
      .toMatchObject({ ok: false, status: 404 });
    h.page = { id: pageId, project_id: randomUUID(), page_is_database: true, deleted_at: null };
    expect(await createPageDatabaseView(projectId, pageId, "actor", { name: "Table", view: config }))
      .toMatchObject({ ok: false, status: 404 });
    expect(h.rows).toHaveLength(0);
  });

  it("deletes only a view of this database, and never its last one", async () => {
    const first = await createPageDatabaseView(projectId, pageId, "actor", { name: "Table", view: config });
    const second = await createPageDatabaseView(projectId, pageId, "actor", { name: "Mine", view: config });
    if (!first.ok || !second.ok) throw new Error("create failed");
    expect(await deletePageDatabaseView(projectId, randomUUID(), first.page.id, "actor"))
      .toMatchObject({ ok: false, status: 404 });
    expect(await deletePageDatabaseView(projectId, pageId, first.page.id, "actor"))
      .toMatchObject({ ok: true });
    expect(await deletePageDatabaseView(projectId, pageId, second.page.id, "actor"))
      .toMatchObject({ ok: false, status: 400 });
    expect(h.rows.map((row) => row.id)).toEqual([second.page.id]);
  });

  it("keeps a concurrent rename when a filter change lands at the same time", async () => {
    const created = await createPageDatabaseView(projectId, pageId, "actor", { name: "Table", view: config });
    if (!created.ok) throw new Error("create failed");
    // Another member renames the view between this update's read and write.
    h.beforeUpdate = () => {
      h.rows[0].updated_at = "2026-10-22T10:00:00.000Z";
      h.protect = false;
      h.rows[0] = { ...h.rows[0], name: "Renamed", view: config,
        encrypted_content: null, encryption_version: 0 };
    };
    const updated = await updatePageDatabaseView(projectId, pageId, created.page.id, "actor",
      { view: { ...config, filterValue: "Acme" } });
    expect(updated).toMatchObject({ ok: true, page: { name: "Renamed", view: { filterValue: "Acme" } } });
  });

  it("hides the views of a project the actor cannot read", async () => {
    await createPageDatabaseView(projectId, pageId, "actor", { name: "Table", view: config });
    h.member = false;
    expect(await listPageDatabaseViews(projectId, pageId, "outsider"))
      .toMatchObject({ ok: false, status: 404 });
  });

  it("copies every view to the duplicated database, sealed for its new row", async () => {
    await createPageDatabaseView(projectId, pageId, "actor", { name: "Table", view: config });
    const copyId = randomUUID();
    const service = (await import("@/lib/supabase-service")).getServiceClient();
    await copyPageDatabaseViews(service as never, projectId, new Map([[pageId, copyId]]), "actor");
    expect(h.rows.map((row) => row.page_id)).toEqual([pageId, copyId]);
    expect(h.rows[0].encrypted_content).not.toBe(h.rows[1].encrypted_content);
    h.page = { id: copyId, project_id: projectId, page_is_database: true, deleted_at: null };
    expect(await listPageDatabaseViews(projectId, copyId, "actor"))
      .toMatchObject({ ok: true, page: [{ name: "Table", view: config }] });
  });
});
