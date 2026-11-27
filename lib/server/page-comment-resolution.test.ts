import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resolving a page thread (MIN-1002): which row is written, by whom, and
 * who is refused. The write goes through the service client, so the access
 * check in `resolvePageThread` is the only one there is.
 */

type Row = Record<string, unknown>;

const H = vi.hoisted(() => ({
  access: vi.fn(async () => ({ role: "member", canWrite: true, canComment: true }) as unknown),
  page: { project_id: "p1" } as Record<string, unknown> | null,
  comment: null as Record<string, unknown> | null,
  updates: [] as { payload: Record<string, unknown>; filters: Record<string, unknown> }[],
}));

vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: async () => {},
  projectMemberIds: async () => new Set<string>(),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => H.access(...(args as [])),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      const filters: Row = {};
      let payload: Row | null = null;
      const query = {
        select: () => query,
        is: () => query,
        update(row: Row) {
          payload = row;
          return query;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        async maybeSingle() {
          if (table === "pages") return { data: H.page, error: null };
          if (!payload) return { data: H.comment, error: null };
          H.updates.push({ payload, filters: { ...filters } });
          return { data: { id: filters.id, body: "Root", quote: null, ...payload }, error: null };
        },
      };
      return query;
    },
  }),
}));

const { resolvePageThread } = await import("./page-comments");

const request = { pageId: "page-1", commentId: "reply-1", actorId: "u-bob" };

beforeEach(() => {
  H.access.mockClear();
  H.access.mockImplementation(async () => ({ role: "member", canWrite: true, canComment: true }));
  H.page = { project_id: "p1" };
  H.comment = { id: "reply-1", parent_id: "root-1" };
  H.updates.length = 0;
});

describe("resolvePageThread", () => {
  it("resolves the thread's root on this page, in the name of whoever asked", async () => {
    const result = await resolvePageThread({ ...request, resolved: true });

    expect(result.ok).toBe(true);
    expect(H.updates).toHaveLength(1);
    const [{ payload, filters }] = H.updates;
    expect(filters).toEqual({ id: "root-1", page_id: "page-1" });
    expect(payload.resolved_by).toBe("u-bob");
    expect(Number.isNaN(Date.parse(payload.resolved_at as string))).toBe(false);
  });

  it("reopens by clearing who resolved it and when", async () => {
    H.comment = { id: "root-1", parent_id: null };
    await resolvePageThread({ ...request, commentId: "root-1", resolved: false });

    expect(H.updates[0]).toEqual({
      payload: { resolved_at: null, resolved_by: null },
      filters: { id: "root-1", page_id: "page-1" },
    });
  });

  it("refuses a reader who cannot comment, before any write", async () => {
    H.access.mockImplementation(async () => ({ role: "reader", canWrite: false, canComment: false }));
    const result = await resolvePageThread({ ...request, resolved: true });

    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "commentNotAllowed" });
    expect(H.updates).toHaveLength(0);
  });

  it("answers 404 for a project the caller cannot see, a trashed page or a comment of another page", async () => {
    H.access.mockImplementation(async () => null);
    expect(await resolvePageThread({ ...request, resolved: true })).toMatchObject({ ok: false, status: 404 });

    H.access.mockImplementation(async () => ({ role: "member", canWrite: true, canComment: true }));
    H.page = null;
    expect(await resolvePageThread({ ...request, resolved: true })).toMatchObject({ ok: false, status: 404, errorKey: "pageNotFound" });

    H.page = { project_id: "p1" };
    H.comment = null;
    expect(await resolvePageThread({ ...request, resolved: true })).toMatchObject({ ok: false, status: 404, errorKey: "commentNotFound" });
    expect(H.updates).toHaveLength(0);
  });
});
