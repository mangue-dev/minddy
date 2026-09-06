import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  getPage: vi.fn(),
  rpc: vi.fn(),
  event: vi.fn(),
}));
vi.mock("@/lib/server/pages", () => ({ getPage: h.getPage }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc: h.rpc }),
}));
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
  h.getPage.mockImplementation(async (id: string) => ({
    ok: true,
    page: id === "db" ? database : entry,
  }));
  h.rpc.mockResolvedValue({ data: { status: "updated" }, error: null });
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
