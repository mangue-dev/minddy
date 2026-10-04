import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  getProjectAccess: vi.fn(async () => ({ role: "member" })),
  insertAttachments: vi.fn(),
  parseResourcesInput: vi.fn(),
  removeUnretainedResources: vi.fn(async () => {}),
  insertNotifications: vi.fn(async () => {}),
  projectMemberIds: vi.fn(async () => new Set<string>()),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: mocks.getServiceClient,
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: mocks.getProjectAccess,
}));
vi.mock("@/lib/server/attachments", () => ({
  insertAttachments: mocks.insertAttachments,
  parseResourcesInput: mocks.parseResourcesInput,
  removeUnretainedResources: mocks.removeUnretainedResources,
}));
vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: mocks.insertNotifications,
  projectMemberIds: mocks.projectMemberIds,
}));

const { addCommentToIssue } = await import("./add-comment");

const resources = [
  {
    storage_path: "projects/project-1/upload/reply.png",
    file_name: "reply.png",
    mime_type: "image/png",
    size_bytes: 12,
  },
];

function queryResult(data: unknown) {
  const query = {
    select: () => query,
    is: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

function service(commentInsert: { data: unknown; error: unknown }, owner = "owner-1") {
  return {
    from(table: string) {
      if (table === "issues") {
        return queryResult({
          project_id: "project-1",
          created_by: owner,
          assignee_id: null,
        });
      }
      if (table === "comments") {
        return {
          ...queryResult({
            id: "root-1",
            parent_id: null,
            issue_id: "issue-1",
            author_id: "owner-1",
          }),
          insert: () => ({
            select: () => ({
              single: async () => commentInsert,
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe("comment reply and root deletion races", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseResourcesInput.mockReturnValue(resources);
  });

  it("removes the uploaded object once when root deletion wins before reply insertion", async () => {
    mocks.getServiceClient.mockReturnValue(
      service({ data: null, error: { message: "comments_parent_id_fkey" } }),
    );

    const result = await addCommentToIssue({
      issueId: "issue-1",
      actorId: "actor-1",
      body: "Reply",
      parentId: "root-1",
      attachments: resources,
    });

    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(mocks.insertAttachments).not.toHaveBeenCalled();
    expect(mocks.removeUnretainedResources).toHaveBeenCalledTimes(1);
    expect(mocks.removeUnretainedResources).toHaveBeenCalledWith(
      expect.anything(),
      resources,
    );
  });

  it("removes the uploaded object once when deletion wins before attachment registration", async () => {
    mocks.getServiceClient.mockReturnValue(
      service({
        data: { id: "reply-1", body: "Reply", issue_id: "issue-1", parent_id: "root-1" },
        error: null,
      }),
    );
    mocks.insertAttachments.mockRejectedValueOnce(
      new Error("attachments_comment_id_fkey"),
    );

    const result = await addCommentToIssue({
      issueId: "issue-1",
      actorId: "actor-1",
      body: "Reply",
      parentId: "root-1",
      attachments: resources,
    });

    expect(result).toMatchObject({ ok: true });
    expect(mocks.removeUnretainedResources).toHaveBeenCalledTimes(1);
    expect(mocks.removeUnretainedResources).toHaveBeenCalledWith(
      expect.anything(),
      resources,
    );
  });
});


describe("issue comment notification recipients", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.parseResourcesInput.mockReturnValue([]); });
  it("skips recipient lookup for a self-only comment after enforcing project access", async () => {
    mocks.insertAttachments.mockResolvedValue([]);
    mocks.getServiceClient.mockReturnValue(service({ data: { id: "comment-1", body: "Private note" }, error: null }, "actor-1"));
    const result = await addCommentToIssue({ issueId: "issue-1", actorId: "actor-1", body: "Private note", mentionedUserIds: ["actor-1"] });
    expect(result.ok).toBe(true);
    expect(mocks.getProjectAccess).toHaveBeenCalledWith("actor-1", "project-1");
    expect(mocks.projectMemberIds).not.toHaveBeenCalled();
    expect(mocks.insertNotifications).toHaveBeenCalledWith(expect.anything(), []);
  });

  it("checks current membership for real recipients and excludes outsiders", async () => {
    mocks.insertAttachments.mockResolvedValue([]);
    mocks.projectMemberIds.mockResolvedValueOnce(new Set(["owner-1", "member-1"]));
    mocks.getServiceClient.mockReturnValue(service({ data: { id: "comment-1", body: "Team note" }, error: null }));
    const result = await addCommentToIssue({ issueId: "issue-1", actorId: "actor-1", body: "Team note", mentionedUserIds: ["member-1", "outsider", "actor-1"] });
    expect(result.ok).toBe(true);
    expect(mocks.projectMemberIds).toHaveBeenCalledWith(expect.anything(), "project-1");
    const rows = (mocks.insertNotifications.mock.calls.at(-1) as unknown as [unknown, { user_id: string }[]])[1];
    expect(rows.map((row: { user_id: string }) => row.user_id).sort()).toEqual(["member-1", "owner-1"]);
  });
});
