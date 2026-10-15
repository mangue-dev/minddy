import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The project icon is refetched on every startup. Its access check needs only
 * the owner and membership decision, so the route reads the project row once
 * (with the icon reference), probes membership alongside, and never decodes the
 * project. Denied, missing and trashed projects still answer 404 with no bytes.
 */

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OWNER = "owner-1";

const h = vi.hoisted(() => ({
  user: "owner-1" as string | null,
  members: [] as string[],
  deleted: false,
  log: [] as string[],
  holdProject: false,
  releaseProject: () => {},
  download: vi.fn(),
  decodeProject: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => h.user
    ? { ok: true, user: { id: h.user }, supabase: {} }
    : { ok: false, response: new Response(null, { status: 401 }) },
}));
vi.mock("@/lib/server/project-content", () => ({
  decodeProject: async (row: Record<string, unknown>) => {
    h.decodeProject();
    return row;
  },
  projectForClient: (row: Record<string, unknown>) => row,
}));
vi.mock("@/lib/server/project-icon-content", () => ({
  downloadProtectedProjectIcon: async (_service: unknown, projectId: string, path: string) => {
    h.download(projectId, path);
    return { bytes: Buffer.from("icon"), mimeType: "image/webp" };
  },
  projectIconRoute: () => "",
}));
vi.mock("@/lib/server/feedback/boards", () => ({ getBoardByToken: vi.fn() }));
vi.mock("@/lib/server/view-shares", () => ({ getPublicShareTarget: vi.fn() }));
vi.mock("@/lib/server/share-unlock", () => ({ isShareUnlocked: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        is: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        },
        maybeSingle: async () => {
          h.log.push(table);
          if (table === "project_members") {
            return { data: h.members.includes(filters.user_id as string) ? { project_id: PROJECT } : null, error: null };
          }
          if (h.holdProject) await new Promise<void>((resolve) => { h.releaseProject = resolve; });
          h.log.push("projects-resolved");
          const live = !h.deleted || filters.deleted_at !== null;
          return {
            data: filters.id === PROJECT && live
              ? {
                id: PROJECT, owner_id: OWNER, encryption_version: 1, encrypted_content: "sealed",
                icon_url: `/api/projects/${PROJECT}/icon/content?v=1`, icon_storage_path: "icons/p.bin",
              }
              : null,
            error: null,
          };
        },
      };
      return query;
    },
  }),
}));

const { GET } = await import("@/app/api/projects/[id]/icon/content/route");

const call = () => GET(
  new NextRequest(`https://minddy.test/api/projects/${PROJECT}/icon/content?v=1`),
  { params: Promise.resolve({ id: PROJECT }) },
);
const projectReads = () => h.log.filter((entry) => entry === "projects").length;

beforeEach(() => {
  h.user = OWNER;
  h.members = [];
  h.deleted = false;
  h.log = [];
  h.holdProject = false;
  h.download.mockClear();
  h.decodeProject.mockClear();
});

describe("GET /api/projects/[id]/icon/content", () => {
  it("serves the owner's icon from one project read without decoding the project", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("icon");
    expect(projectReads()).toBe(1);
    expect(h.decodeProject).not.toHaveBeenCalled();
    expect(h.download).toHaveBeenCalledWith(PROJECT, "icons/p.bin");
  });

  it("probes membership while the project read is pending", async () => {
    h.user = "member-1";
    h.members = ["member-1"];
    h.holdProject = true;
    const response = call();
    await vi.waitFor(() => expect(h.log).toContain("projects"));
    await vi.waitFor(() => expect(h.log).toContain("project_members"));
    expect(h.log).not.toContain("projects-resolved");
    h.releaseProject();
    expect((await response).status).toBe(200);
    expect(projectReads()).toBe(1);
  });

  it.each([
    ["a non-member", () => { h.user = "stranger"; }],
    ["a trashed project", () => { h.deleted = true; }],
    ["a signed-out caller", () => { h.user = null; }],
  ])("answers 404 without bytes for %s", async (_label, arrange) => {
    arrange();
    const response = await call();
    expect(response.status).toBe(404);
    expect(h.download).not.toHaveBeenCalled();
  });
});
