import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolExtra, ToolResult } from "./tool-helpers";

const h = vi.hoisted(() => ({
  softDelete: vi.fn(),
  restore: vi.fn(),
  list: vi.fn(),
  page: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/server/trash", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/trash")>()),
  softDeleteItem: h.softDelete,
  restoreItem: h.restore,
  listTrashForUser: h.list,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: h.page, error: null }) }),
      }),
    }),
  }),
}));
vi.mock("./tool-helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tool-helpers")>()),
  requireUser: () => ({ userId: "member", keyId: null }),
  requireProject: async () => ({ userId: "member", keyId: null, access: { project: { id: "project" } } }),
}));

const { registerTrashTools } = await import("./trash-tools");

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerTrashTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

const call = async (name: string, args: Record<string, unknown>) => {
  const result = await handlers.get(name)!(args, {} as ToolExtra);
  return { isError: result.isError === true, body: JSON.parse(result.content[0].text) };
};

const PAGE = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  h.page = { project_id: "project", deleted_at: null };
});

describe("MCP trash tools", () => {
  it("trashes a page of the named project as an agent gesture", async () => {
    h.softDelete.mockResolvedValue({ ok: true });
    const { isError, body } = await call("minddy_trash_page", { project_id: "project", page_id: PAGE });
    expect(isError).toBe(false);
    expect(body).toMatchObject({ trashed: true, page_id: PAGE });
    expect(h.softDelete).toHaveBeenCalledWith("page", PAGE, "member", "agent");
  });

  it("refuses a page that belongs to another project", async () => {
    h.page = { project_id: "elsewhere", deleted_at: null };
    const { isError, body } = await call("minddy_trash_page", { project_id: "project", page_id: PAGE });
    expect(isError).toBe(true);
    expect(body.error.code).toBe("not_found");
    expect(h.softDelete).not.toHaveBeenCalled();
  });

  it("filters the trash by project and type", async () => {
    const item = (type: string, id: string, project_id: string) => ({
      type, id, title: id, identifier: null, project_id, project_name: "P",
      deleted_at: "2026-11-15T00:00:00Z", deleted_by: { full_name: "Camille Roy" },
    });
    h.list.mockResolvedValue([
      item("page", "a", "project"),
      item("issue", "b", "project"),
      item("page", "c", "other"),
    ]);
    const { body } = await call("minddy_list_trash", { project_id: "project", type: "page" });
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["a"]);
    expect(body.items[0].deleted_by).toBe("Camille Roy");
    expect(typeof body.retention_days).toBe("number");
  });

  it("restores an item and reports the trash core's refusal", async () => {
    h.restore.mockResolvedValueOnce({ ok: true });
    const restored = await call("minddy_restore_from_trash", { type: "page", id: PAGE });
    expect(restored.body).toEqual({ restored: true, type: "page", id: PAGE });
    expect(h.restore).toHaveBeenCalledWith("page", PAGE, "member", "agent");

    h.restore.mockResolvedValueOnce({ ok: false, status: 403, errorKey: "ownerOnly" });
    const refused = await call("minddy_restore_from_trash", { type: "routine", id: PAGE });
    expect(refused.isError).toBe(true);
    expect(refused.body.error.code).toBe("forbidden");
  });
});
