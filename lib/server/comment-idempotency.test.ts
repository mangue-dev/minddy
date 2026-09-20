import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(), access: vi.fn(), insertAttachments: vi.fn(),
  parseResourcesInput: vi.fn(), cleanup: vi.fn(), notify: vi.fn(), members: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: mocks.getServiceClient }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: mocks.access }));
vi.mock("@/lib/server/attachments", () => ({
  insertAttachments: mocks.insertAttachments, parseResourcesInput: mocks.parseResourcesInput,
  removeUnretainedResources: mocks.cleanup,
}));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: mocks.notify, projectMemberIds: mocks.members }));

const { addCommentToIssue } = await import("./add-comment");
const { addPageComment } = await import("./page-comments");
const commentId = "77777777-7777-4777-8777-777777777777";
const attachment = { storage_path: "projects/p1/test.png", file_name: "test.png", mime_type: "image/png", size_bytes: 3 };

function serviceFor(entity: "page" | "issue", existingAuthor: string = "u1", existingEntity: string = "e1") {
  let inserted: Record<string, unknown> | undefined;
  const filters: Record<string, unknown> = {};
  const existing = { id: commentId, author_id: existingAuthor, [`${entity}_id`]: existingEntity, body: "Original", attachments: [{ id: "a1", ...attachment }] };
  const service = { from(table: string) {
    const query = {
      select: () => query, is: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      maybeSingle: async () => ({
        data: table === "pages" || table === "issues"
          ? { project_id: "p1", created_by: "u1", assignee_id: null }
          : Object.entries(filters).every(([key, value]) => existing[key as keyof typeof existing] === value) ? existing : null,
        error: null,
      }),
      insert: (row: Record<string, unknown>) => { inserted = row; Object.keys(filters).forEach((key) => delete filters[key]); return query; },
      single: async () => ({ data: null, error: { code: "23505", message: "duplicate key" } }),
    };
    return query;
  } };
  return { service, inserted: () => inserted, filters, existing };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ role: "member" });
  mocks.parseResourcesInput.mockReturnValue([attachment]);
  mocks.insertAttachments.mockResolvedValue([]);
  mocks.members.mockResolvedValue(new Set());
});

for (const entity of ["issue", "page"] as const) {
  const create = (args = {}) => entity === "issue"
    ? addCommentToIssue({ issueId: "e1", actorId: "u1", commentId, body: "Original", attachments: [attachment], ...args })
    : addPageComment({ pageId: "e1", actorId: "u1", commentId, body: "Original", ...args });
  describe(`${entity} comment UUID replay`, () => {
    it("returns the original comment and attachments without repeating side effects", async () => {
      const test = serviceFor(entity);
      mocks.getServiceClient.mockReturnValue(test.service);
      const result = await create();
      expect(result).toEqual({ ok: true, replayed: true, comment: test.existing });
      expect(test.inserted()).toMatchObject({ id: commentId, author_id: "u1" });
      expect(mocks.insertAttachments).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.cleanup).not.toHaveBeenCalled();
    });
    it.each([["other-user", "e1"], ["u1", "other-entity"]])("does not replay another author/entity (%s, %s)", async (author, parent) => {
      mocks.getServiceClient.mockReturnValue(serviceFor(entity, author, parent).service);
      expect(await create()).toMatchObject({ ok: false, status: 409 });
      expect(mocks.notify).not.toHaveBeenCalled();
      expect(mocks.cleanup).not.toHaveBeenCalled();
    });
    it("checks current project access before attempting a replay", async () => {
      const test = serviceFor(entity);
      mocks.getServiceClient.mockReturnValue(test.service);
      mocks.access.mockResolvedValue(null);
      expect(await create()).toMatchObject({ ok: false, status: 404 });
      expect(test.inserted()).toBeUndefined();
    });
  });
}

describe("partial issue-comment attachment recovery", () => {
  it("finishes a previously failed attachment batch without repeating notifications", async () => {
    const test = serviceFor("issue");
    const complete = test.existing.attachments;
    test.existing.attachments = [];
    mocks.getServiceClient.mockReturnValue(test.service);
    mocks.insertAttachments.mockImplementationOnce(async () => { test.existing.attachments = complete; return complete; });
    const result = await addCommentToIssue({ issueId: "e1", actorId: "u1", commentId, body: "Original", attachments: [attachment] });
    expect(result).toMatchObject({ ok: true, replayed: true, comment: { attachments: complete } });
    expect(mocks.insertAttachments).toHaveBeenCalledWith(test.service, expect.objectContaining({ idempotencyKey: commentId, resources: [attachment] }));
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("retains uploaded resources and reports an incomplete retry", async () => {
    const test = serviceFor("issue");
    test.existing.attachments = [];
    mocks.getServiceClient.mockReturnValue(test.service);
    mocks.insertAttachments.mockRejectedValueOnce(new Error("Storage temporarily unavailable"));
    const result = await addCommentToIssue({ issueId: "e1", actorId: "u1", commentId, body: "Original", attachments: [attachment] });
    expect(result).toMatchObject({ ok: true, replayed: true, attachmentError: true });
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
