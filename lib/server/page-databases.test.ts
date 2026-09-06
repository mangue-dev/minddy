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
import { updatePageDatabase } from "./page-databases";

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
      p_input: input,
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
