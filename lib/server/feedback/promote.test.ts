import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: { current: null as Record<string, unknown> | null },
  issue: { current: null as Record<string, unknown> | null },
  /** Rows the guarded link write matched: empty when another writer won. */
  linkedRows: { current: [] as { id: string }[] },
  updates: [] as Record<string, unknown>[],
  emitFeedbackLinked: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("feedback_posts");
      let patch: Record<string, unknown> | null = null;
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.is = () => query;
      query.eq = () => query;
      query.update = (values: Record<string, unknown>) => { patch = values; return query; };
      query.maybeSingle = async () => ({ data: mocks.post.current, error: null });
      query.then = (resolve: (value: unknown) => unknown) => {
        if (patch) mocks.updates.push(patch);
        return Promise.resolve({ data: mocks.linkedRows.current, error: null }).then(resolve);
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    const query = { select: () => query, is: () => query, eq: () => query,
      maybeSingle: async () => ({ data: mocks.issue.current, error: null }) };
    return query;
  },
}));
vi.mock("@/lib/server/feedback/events", () => ({
  emitFeedbackLinked: mocks.emitFeedbackLinked,
  emitFeedbackPromoted: vi.fn(),
  emitFeedbackUnlinked: vi.fn(),
}));
vi.mock("@/lib/server/create-issue", () => ({ createIssueForProject: vi.fn() }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: vi.fn() }));
vi.mock("@/lib/server/feedback-post-store", () => ({ feedbackPostStore: vi.fn() }));

const { linkFeedbackIssue } = await import("./promote");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates.length = 0;
  mocks.post.current = { id: "post-1", project_id: "project-1", merged_into_id: null, issue_id: null };
  mocks.issue.current = { id: "issue-1", status: "in_progress", project_id: "project-1" };
  mocks.linkedRows.current = [{ id: "post-1" }];
});

describe("linkFeedbackIssue", () => {
  it("links an unlinked post and records the link", async () => {
    await expect(linkFeedbackIssue({ postId: "post-1", issueId: "issue-1", actorId: "user-1" }))
      .resolves.toEqual({ ok: true });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.emitFeedbackLinked).toHaveBeenCalledOnce();
  });

  it("reports a link lost to a concurrent writer and records no link event", async () => {
    mocks.linkedRows.current = [];
    await expect(linkFeedbackIssue({ postId: "post-1", issueId: "issue-1", actorId: "user-1" }))
      .resolves.toEqual({ ok: false, status: 404, errorKey: "feedbackNotFound" });
    expect(mocks.emitFeedbackLinked).not.toHaveBeenCalled();
  });
});
