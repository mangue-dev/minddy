import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-742 — PATCH /api/resources/[id] renames a file or a link. It follows
 * the same two guards as DELETE (the uploader, still in the project with the
 * matching capability) and refuses a page resource, whose name is its page's
 * live title.
 */

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const RESOURCE = "22222222-2222-4222-8222-222222222222";

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const renameAttachment = vi.fn();
let row: Record<string, unknown> | null = null;
const lookups: Array<Record<string, unknown>> = [];

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: (...args: unknown[]) => getAuthedUser(...args) }));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
}));
vi.mock("@/lib/server/attachments", () => ({
  removeStorageObjects: vi.fn(),
  renameAttachment: (...args: unknown[]) => renameAttachment(...args),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => {
          lookups.push(filters);
          return { data: row, error: null };
        },
      };
      return query;
    },
  }),
}));

const { PATCH } = await import("@/app/api/resources/[id]/route");

const patch = (body: unknown) =>
  PATCH(
    new Request("https://www.minddy.app/api/resources/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: RESOURCE }) },
  );

const writer = { canWrite: true, canComment: true };

beforeEach(() => {
  vi.clearAllMocks();
  lookups.length = 0;
  row = { project_id: PROJECT, comment_id: null, kind: "file" };
  getAuthedUser.mockResolvedValue({ ok: true, user: { id: USER } });
  getProjectAccess.mockResolvedValue(writer);
  renameAttachment.mockImplementation(async (_service: unknown, { fileName }: { fileName: string }) => ({ id: RESOURCE, file_name: fileName }));
});

describe("PATCH /api/resources/[id]", () => {
  it("renames the uploader's resource with the normalized name", async () => {
    const response = await patch({ file_name: "  Spec\nv2.pdf " });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: RESOURCE, file_name: "Spec v2.pdf" });
    expect(renameAttachment).toHaveBeenCalledWith(expect.anything(), {
      id: RESOURCE, projectId: PROJECT, fileName: "Spec v2.pdf",
    });
    // The row is looked up as the caller's own.
    expect(lookups[0]).toEqual({ id: RESOURCE, created_by: USER });
  });

  it("refuses an empty name before reading anything", async () => {
    const response = await patch({ file_name: "   " });
    expect(response.status).toBe(400);
    expect(lookups).toHaveLength(0);
    expect(renameAttachment).not.toHaveBeenCalled();
  });

  it("answers 404 for someone else's resource or a project the caller left", async () => {
    row = null;
    expect((await patch({ file_name: "a.pdf" })).status).toBe(404);
    row = { project_id: PROJECT, comment_id: null, kind: "file" };
    getProjectAccess.mockResolvedValue(null);
    expect((await patch({ file_name: "a.pdf" })).status).toBe(404);
    expect(renameAttachment).not.toHaveBeenCalled();
  });

  it("follows the capability of where the resource hangs", async () => {
    getProjectAccess.mockResolvedValue({ canWrite: false, canComment: true });
    expect((await patch({ file_name: "a.pdf" })).status).toBe(403);
    row = { project_id: PROJECT, comment_id: "c1", kind: "file" };
    expect((await patch({ file_name: "a.pdf" })).status).toBe(200);
  });

  it("refuses to rename a page resource", async () => {
    row = { project_id: PROJECT, comment_id: null, kind: "page" };
    expect((await patch({ file_name: "Roadmap" })).status).toBe(400);
    expect(renameAttachment).not.toHaveBeenCalled();
  });
});
