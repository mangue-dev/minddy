import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  getPage: vi.fn(),
  rpc: vi.fn(),
  event: vi.fn(),
  query: {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: vi.fn(),
  },
  commitBatch: vi.fn(),
  writeRefusal: vi.fn(),
}));
vi.mock("@/lib/server/pages", () => ({ getPage: h.getPage, pageWriteRefusal: h.writeRefusal }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc: h.rpc, from: () => h.query }),
}));
vi.mock("./page-content", () => ({ decodePage: async (row: unknown) => row }));
vi.mock("./page-content-batch", () => ({ commitPageContentBatch: h.commitBatch }));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("@/lib/server/page-activity", () => ({ recordPageEvent: h.event }));
import { convertPageDatabase, updatePageDatabase } from "./page-databases";

const propertyId = "10000000-0000-4000-8000-000000000001";
const schema = [{ id: propertyId, type: "date", name: "Date" }];
const database = {
  id: "db",
  project_id: "project",
  database_schema: schema,
  database_revision: 0,
};
const entry = {
  id: "entry",
  project_id: "project",
  parent_id: "db",
  property_values: {},
};
beforeEach(() => {
  vi.clearAllMocks();
  h.writeRefusal.mockResolvedValue(null);
  h.getPage.mockImplementation(async (id: string) => ({
    ok: true,
    page: id === "db" ? database : entry,
  }));
  h.rpc.mockResolvedValue({ data: { status: "updated" }, error: null });
  h.query.range.mockResolvedValue({ data: [], error: null });
  h.commitBatch.mockResolvedValue("updated");
});

describe("protected database option edits", () => {
  const ready = { id: "10000000-0000-4000-8000-000000000007", name: "Ready", color: "#22c55e" };
  const later = { id: "10000000-0000-4000-8000-000000000008", name: "Later", color: "#3b82f6" };
  const single = { id: "10000000-0000-4000-8000-000000000002", name: "Status", type: "select", options: [ready, later] };
  const multi = { ...single, id: "10000000-0000-4000-8000-000000000003", name: "Tags", type: "multi_select" };
  const protectedDatabase = { ...database, encryption_version: 1,
    content_revision: 3, database_schema: [...schema, single, multi] };
  const values = { [propertyId]: "2026-10-12T12:30:00.000Z", [single.id]: ready.id, [multi.id]: [ready.id, later.id] };
  const children = [
    { ...entry, encryption_version: 1, content_revision: 4, property_values: values },
    { ...entry, id: "trash", encryption_version: 1, content_revision: 5,
      deleted_at: "2026-10-11T12:00:00Z", property_values: values },
  ];
  beforeEach(() => {
    h.getPage.mockImplementation(async (id: string) => ({ ok: true,
      page: id === "db" ? protectedDatabase : children[0] }));
    h.query.range.mockResolvedValue({ data: children, error: null });
  });
  it("persists option order without replacing existing assignments", async () => {
    const next = protectedDatabase.database_schema.map((p) => "options" in p ? { ...p, options: [later, ready] } : p);
    expect(await updatePageDatabase("project", "db", "actor", {
      operation: "schema", schema: next, revision: 0,
    })).toMatchObject({ ok: true });
    const batch = h.commitBatch.mock.calls[0][0];
    expect(batch.edits).toHaveLength(1);
    expect(batch.edits[0].next.database_schema).toEqual(next);
    expect(batch.expectedChildren).toEqual(["entry", "trash"]);
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("atomically removes deleted options from live and trashed entries while keeping other selections and dates", async () => {
    const next = protectedDatabase.database_schema.map((p) => "options" in p ? { ...p, options: [later] } : p);
    expect(await updatePageDatabase("project", "db", "actor", {
      operation: "schema", schema: next, revision: 0,
    })).toMatchObject({ ok: true });
    const batch = h.commitBatch.mock.calls[0][0];
    expect(batch.edits).toHaveLength(3);
    for (const edit of batch.edits.slice(1)) expect(edit.next.property_values).toEqual({
      [propertyId]: values[propertyId], [multi.id]: [later.id],
    });
    expect(batch.expected).toEqual([protectedDatabase, ...children]);
  });
  it("keeps protected cell timestamps and exact preconditions intact", async () => {
    expect(await updatePageDatabase("project", "entry", "actor", {
      operation: "value", propertyId, value: "2026-10-12T00:00:00.000Z", expected: values[propertyId],
    })).toMatchObject({ ok: true });
    expect(h.commitBatch.mock.calls[0][0].edits[0].next.property_values[propertyId]).toBe("2026-10-12T00:00:00.000Z");
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe("page database server boundary", () => {
  it("does not write inaccessible pages or cross-project URLs", async () => {
    expect(
      await updatePageDatabase("other", "entry", "actor", {}),
    ).toMatchObject({ ok: false, status: 404 });
    h.getPage.mockResolvedValue({
      ok: false,
      status: 404,
      errorKey: "pageNotFound",
    });
    expect(
      await updatePageDatabase("project", "entry", "actor", {}),
    ).toMatchObject({ ok: false, status: 404 });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("requires schema revisions and refuses invalid schemas", async () => {
    for (const input of [
      { operation: "schema", schema },
      {
        operation: "schema",
        schema: [{ ...schema[0], type: "formula" }],
        revision: 0,
      },
    ]) {
      expect(
        await updatePageDatabase("project", "db", "actor", input),
      ).toMatchObject({ ok: false, status: 400 });
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("validates the shared title column name before changing the schema", async () => {
    for (const titleName of ["", "   ", "x".repeat(81), 42, {}]) {
      expect(
        await updatePageDatabase("project", "db", "actor", {
          operation: "schema",
          schema,
          revision: 0,
          titleName,
        }),
      ).toMatchObject({ ok: false, status: 400 });
    }
    expect(h.rpc).not.toHaveBeenCalled();
    expect(
      await updatePageDatabase("project", "db", "actor", {
        operation: "schema",
        schema,
        revision: 0,
        titleName: "Report",
      }),
    ).toMatchObject({ ok: true });
    expect(h.rpc.mock.calls[0][1].p_input.titleName).toBe("Report");
  });
  it("validates values against the parent schema and requires the previous value", async () => {
    for (const input of [
      { operation: "value", propertyId, value: "2026-02-30", expected: null },
      {
        operation: "value",
        propertyId: "unknown",
        value: null,
        expected: null,
      },
      { operation: "value", propertyId, value: "2026-01-01" },
    ])
      expect(
        await updatePageDatabase("project", "entry", "actor", input),
      ).toMatchObject({ ok: false, status: 400 });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("passes actor, project, and cell precondition to the atomic write", async () => {
    const input = {
      operation: "value",
      propertyId,
      value: "2026-01-01",
      expected: null,
    };
    expect(
      await updatePageDatabase("project", "entry", "actor", input),
    ).toMatchObject({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("update_page_database_guarded", {
      p_project_id: "project",
      p_page_id: "entry",
      p_actor_id: "actor",
      p_input: { ...input, kind: "human", mcpKeyId: null },
    });
  });
  it("passes a timed date and its exact previous value through the guarded save", async () => {
    const input = { operation: "value", propertyId,
      value: "2026-10-12T14:30:00+02:00", expected: "2026-10-12" };
    expect(await updatePageDatabase("project", "entry", "actor", input)).toMatchObject({ ok: true });
    expect(h.rpc).toHaveBeenCalledWith("update_page_database_guarded", expect.objectContaining({
      p_input: { ...input, kind: "human", mcpKeyId: null },
    }));
  });
  it("reports stale cells and schema edits without retrying over them", async () => {
    h.rpc.mockResolvedValue({ data: { status: "conflict" }, error: null });
    expect(
      await updatePageDatabase("project", "db", "actor", {
        operation: "schema",
        schema,
        revision: 0,
      }),
    ).toMatchObject({ ok: false, status: 409, errorKey: "pageDatabaseStale" });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
  it("turns database validation failures into a useful client error", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "22023" } });
    expect(
      await updatePageDatabase("project", "db", "actor", {
        operation: "schema",
        schema,
        revision: 0,
      }),
    ).toMatchObject({
      ok: false,
      status: 400,
      errorKey: "pageDatabaseInvalid",
    });
  });
});

it("keeps Numo attribution server-owned and applies the same concurrency guard", async () => {
  const input = {
    operation: "value",
    propertyId,
    value: "2026-01-01",
    expected: null,
    kind: "agent",
    mcpKeyId: "spoofed",
  };
  await updatePageDatabase("project", "entry", "actor", input);
  expect(h.rpc).toHaveBeenLastCalledWith(
    "update_page_database_guarded",
    expect.objectContaining({ p_input: { ...input, kind: "human", mcpKeyId: null } }),
  );
  await updatePageDatabase("project", "entry", "actor", input, "agent");
  expect(h.rpc).toHaveBeenLastCalledWith(
    "update_page_database_guarded",
    expect.objectContaining({ p_input: { ...input, mcpKeyId: null } }),
  );
  h.rpc.mockResolvedValue({ data: { status: "conflict" }, error: null });
  expect(
    await updatePageDatabase("project", "entry", "actor", input, "agent"),
  ).toMatchObject({ ok: false, status: 409 });
});

it("rejects number strings, unknown options, and writes to creation metadata before RPC", async () => {
  for (const [type, value] of [
    ["number", "12a"],
    ["select", propertyId],
    ["multi_select", [propertyId]],
    ["created_at", null],
  ]) {
    h.getPage.mockImplementation(async (id: string) => ({
      ok: true,
      page:
        id === "db"
          ? {
              ...database,
              database_schema: [
                { id: propertyId, name: "Property", type, options: [] },
              ],
            }
          : entry,
    }));
    expect(
      await updatePageDatabase(
        "project",
        "entry",
        "actor",
        { operation: "value", propertyId, value, expected: null },
        "agent",
      ),
    ).toMatchObject({ ok: false, status: 400 });
  }
  expect(h.rpc).not.toHaveBeenCalled();
});

describe("column conversion boundary", () => {
  const input = {
    operation: "convert", propertyId, targetType: "number", revision: 0,
    preview: true,
  };
  it("validates conversion intent before calling the guarded RPC", async () => {
    for (const change of [
      { targetType: "formula" }, { propertyId: "unknown" }, { revision: -1 },
      { name: " " }, { name: "a".repeat(81) }, { preview: "yes" },
      { preview: false }, { preview: false, token: "invalid" }, { confirmLoss: "true" },
    ]) {
      expect(await convertPageDatabase("project", "db", "actor", { ...input, ...change }))
        .toMatchObject({ ok: false, status: 400 });
    }
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("does not expose preview data through another project", async () => {
    expect(await convertPageDatabase("other", "db", "actor", input))
      .toMatchObject({ ok: false, status: 404 });
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it("returns the guarded preview without recording an edit", async () => {
    const preview = { status: "preview", incompatibleCount: 2, totalCount: 5, token: "a".repeat(32) };
    h.rpc.mockResolvedValue({ data: preview, error: null });
    expect(await convertPageDatabase("project", "db", "actor", input)).toEqual({ ok: true, page: preview });
    expect(h.rpc).toHaveBeenCalledWith("convert_page_database_guarded", {
      p_project_id: "project", p_page_id: "db", p_actor_id: "actor",
      p_input: { ...input, kind: "human", mcpKeyId: null },
    });
    expect(h.event).not.toHaveBeenCalled();
  });
  it("returns a conflict for a stale confirmation and reloads only successful conversions", async () => {
    h.rpc.mockResolvedValueOnce({ data: { status: "conflict" }, error: null });
    const apply = { ...input, preview: false, token: "a".repeat(32), confirmLoss: true, name: "Amount" };
    expect(await convertPageDatabase("project", "db", "actor", apply))
      .toMatchObject({ ok: false, status: 409 });
    expect(await convertPageDatabase("project", "db", "actor", apply))
      .toEqual({ ok: true, page: database });
  });
});

describe("project roles (MIN-693)", () => {
  it("refuses a reader before any database write", async () => {
    h.writeRefusal.mockResolvedValue({ ok: false, status: 403, errorKey: "readOnlyProject" });
    const result = await updatePageDatabase("project", "db", "reader", {
      kind: "schema", revision: 1, schema: { properties: [] },
    });
    expect(result).toEqual({ ok: false, status: 403, errorKey: "readOnlyProject" });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.commitBatch).not.toHaveBeenCalled();
  });
});
