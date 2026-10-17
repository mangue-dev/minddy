import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Comment capability of project roles (MIN-693): a reader comments only with
 * the "Can comment" option, and never posts on the public feedback board,
 * which is the team's voice and therefore a write.
 */

const mocks = vi.hoisted(() => ({
  getServiceClient: vi.fn(),
  getProjectAccess: vi.fn(),
  insertAttachments: vi.fn(async () => []),
  parseResourcesInput: vi.fn(() => [] as unknown[]),
  removeUnretainedResources: vi.fn(async () => {}),
  insertNotifications: vi.fn(async () => {}),
  projectMemberIds: vi.fn(async () => new Set<string>()),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: mocks.getServiceClient }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: mocks.getProjectAccess }));
vi.mock("@/lib/server/attachments", () => ({
  insertAttachments: mocks.insertAttachments,
  parseResourcesInput: mocks.parseResourcesInput,
  removeUnretainedResources: mocks.removeUnretainedResources,
}));
vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: mocks.insertNotifications,
  projectMemberIds: mocks.projectMemberIds,
}));

const { addCommentToFeedbackPost, addCommentToIssue } = await import("./add-comment");

const reader = (canComment: boolean) => ({
  role: "reader", isOwner: false, isMember: true, canWrite: false, canComment,
});
const member = { role: "member", isOwner: false, isMember: true, canWrite: true, canComment: true };

function lookup(data: unknown) {
  const query = {
    select: () => query,
    is: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

/** The insert fails on purpose: reaching it proves the capability gate passed. */
function service(parentVisibility: "internal" | "public" = "internal") {
  return {
    from(table: string) {
      if (table === "issues") {
        return lookup({ project_id: "project-1", created_by: "owner-1", assignee_id: null });
      }
      if (table === "feedback_posts") return lookup({ project_id: "project-1" });
      if (table === "comments") {
        return {
          ...lookup({
            id: "root-1", parent_id: null, issue_id: "issue-1", feedback_post_id: "post-1",
            author_id: "owner-1", visibility: parentVisibility,
          }),
          insert: (row: unknown) => {
            mocks.insert(row);
            return { select: () => ({ single: async () => ({ data: null, error: { message: "stop" } }) }) };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServiceClient.mockReturnValue(service());
});

describe("issue comments", () => {
  it("refuses a reader without the comment option", async () => {
    mocks.getProjectAccess.mockResolvedValue(reader(false));

    const result = await addCommentToIssue({ issueId: "issue-1", actorId: "reader-1", body: "Hi" });

    expect(result).toEqual({ ok: false, status: 403, errorKey: "commentNotAllowed" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("lets a reader with the comment option write their comment", async () => {
    mocks.getProjectAccess.mockResolvedValue(reader(true));

    await addCommentToIssue({ issueId: "issue-1", actorId: "reader-1", body: "Hi" });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});

describe("feedback comments", () => {
  it("lets a commenting reader leave an internal note", async () => {
    mocks.getProjectAccess.mockResolvedValue(reader(true));

    await addCommentToFeedbackPost({ postId: "post-1", actorId: "reader-1", body: "Note" });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("refuses a public board reply from a commenting reader", async () => {
    mocks.getProjectAccess.mockResolvedValue(reader(true));

    const result = await addCommentToFeedbackPost({
      postId: "post-1", actorId: "reader-1", body: "Thanks!", visibility: "public",
    });

    expect(result).toEqual({ ok: false, status: 403, errorKey: "readOnlyProject" });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.removeUnretainedResources).toHaveBeenCalledTimes(1);
  });

  it("refuses a reply that would land in a public thread, whatever was asked", async () => {
    mocks.getServiceClient.mockReturnValue(service("public"));
    mocks.getProjectAccess.mockResolvedValue(reader(true));

    const result = await addCommentToFeedbackPost({
      postId: "post-1", actorId: "reader-1", body: "Reply", parentId: "root-1",
    });

    expect(result).toMatchObject({ ok: false, status: 403, errorKey: "readOnlyProject" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("keeps public team replies open to members", async () => {
    mocks.getProjectAccess.mockResolvedValue(member);

    await addCommentToFeedbackPost({
      postId: "post-1", actorId: "member-1", body: "Thanks!", visibility: "public",
    });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ visibility: "public" }));
  });
});
