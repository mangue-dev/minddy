import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getPage: vi.fn(), listPages: vi.fn() }));
vi.mock("@/lib/server/pages", () => ({ getPage: h.getPage, listPages: h.listPages }));
vi.mock("@/lib/server/pages-projection", () => ({
  pageBodyToMarkdownServer: async () => "",
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

import { readPageForAgent } from "./page-tools";

function page(database_schema: unknown, database_revision = 0) {
  return {
    id: "page",
    project_id: "project",
    parent_id: null,
    title: "",
    icon: null,
    content: null,
    version: 1,
    updated_at: "2026-10-18T00:00:00.000Z",
    updated_kind: "agent",
    database_schema,
    database_revision,
  };
}

async function read(database_schema: unknown, database_revision?: number) {
  h.getPage.mockResolvedValue({ ok: true, page: page(database_schema, database_revision) });
  const result = await readPageForAgent({
    pageId: "page",
    projectId: "project",
    actorId: "actor",
    withBacklinks: false,
  });
  if (!result.ok) throw new Error("read refused");
  return result.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listPages.mockResolvedValue({ ok: true, pages: [] });
});

describe("readPageForAgent database flag", () => {
  it("reports an empty database as a database (MIN-738)", async () => {
    expect(await read([], 0)).toMatchObject({
      is_database: true,
      database_schema: [],
      database_revision: 0,
    });
  });

  it("reports a populated database as a database", async () => {
    const schema = [{ id: "status", name: "Status", type: "select", options: [] }];
    expect(await read(schema, 2)).toMatchObject({ is_database: true, database_revision: 2 });
  });

  it("reports a document as not a database", async () => {
    expect(await read(null)).toMatchObject({ is_database: false });
  });
});
