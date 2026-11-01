import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamFeedbackListItem } from "./team-queries";

vi.mock("server-only", () => ({}));
const detail = vi.fn(async (_projectId: string, postId: string) => ({ id: postId, title: `Post ${postId}` }));
vi.mock("./team-queries", () => ({ getTeamFeedbackDetail: (projectId: string, postId: string) => detail(projectId, postId) }));
const commentRows = vi.fn(async (): Promise<{ data: unknown[] | null; error: unknown }> => ({ data: [{ id: "c1", api_key_id: null }], error: null }));
vi.mock("@/lib/server/comment-store", () => ({
  commentStore: () => ({ select: () => ({ eq: () => ({ order: () => commentRows() }) }) }),
}));
vi.mock("@/lib/server/issue-event-store", () => ({ readIssueEvents: async () => ({ data: [{ id: "e1", api_key_id: null, integration: null }], error: null }) }));
vi.mock("@/lib/server/api-key-actors", () => ({ resolveApiKeyActors: async () => new Map() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));

const { prepareFeedbackPost } = await import("./post-reads");

const post = (id: string, vote_count: number, created_at: string, status = "open") =>
  ({ id, vote_count, created_at, status }) as unknown as TeamFeedbackListItem;
const LIST = [post("a", 1, "2026-10-01T00:00:00Z"), post("b", 9, "2026-10-02T00:00:00Z"), post("c", 4, "2026-10-03T00:00:00Z"), post("d", 50, "2026-10-04T00:00:00Z", "shipped")];

describe("prepareFeedbackPost (MIN-875)", () => {
  beforeEach(() => { detail.mockClear(); commentRows.mockClear(); });

  it("reads the post the page opens first, in the page's own order", async () => {
    const top = await prepareFeedbackPost("p1", "u1", LIST, { state: "unresolved", sort: "top", onlyToReview: false });
    expect(top?.postId).toBe("b");
    const recent = await prepareFeedbackPost("p1", "u1", LIST, { state: "unresolved", sort: "recent", onlyToReview: false });
    expect(recent?.postId).toBe("c");
    expect(top).toMatchObject({ post: { id: "b" }, comments: [{ id: "c1", api_key_name: null }], events: [{ id: "e1", integration_name: null }] });
  });

  it("reads the post a link names when the list holds it, and only then", async () => {
    expect((await prepareFeedbackPost("p1", "u1", LIST, { state: "unresolved", sort: "top", onlyToReview: false, post: "a" }))?.postId).toBe("a");
    // A post outside this project's list is never read here.
    expect((await prepareFeedbackPost("p1", "u1", LIST, { state: "unresolved", sort: "top", onlyToReview: false, post: "elsewhere" }))?.postId).toBe("b");
    expect(detail).not.toHaveBeenCalledWith("p1", "elsewhere");
  });

  it("prepares nothing for an empty list or a failed read", async () => {
    expect(await prepareFeedbackPost("p1", "u1", [], { state: "unresolved", sort: "top", onlyToReview: false })).toBeNull();
    commentRows.mockResolvedValueOnce({ data: null, error: new Error("database") });
    expect(await prepareFeedbackPost("p1", "u1", LIST, { state: "unresolved", sort: "top", onlyToReview: false })).toBeNull();
  });
});
