import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issueStatus: { current: "in_progress" as string | null },
  deferred: [] as (() => Promise<unknown>)[],
  post: { id: "post-1", issue_id: "issue-1", status: "open" as string },
  emitFeedbackFieldChanges: vi.fn(async () => {}),
}));

// Hold the background jobs so the test decides the order they run in.
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: (job: () => Promise<unknown>) => { mocks.deferred.push(job); },
}));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    const query = { select: () => query, is: () => query, eq: () => query,
      maybeSingle: async () => ({
        data: mocks.issueStatus.current ? { status: mocks.issueStatus.current } : null,
        error: null,
      }) };
    return query;
  },
}));
vi.mock("@/lib/server/feedback/events", () => ({
  emitFeedbackFieldChanges: mocks.emitFeedbackFieldChanges,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      let patch: Record<string, unknown> | null = null;
      let changedOnly: string | null = null;
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.is = () => query;
      query.eq = () => query;
      query.neq = (_column: string, value: string) => { changedOnly = value; return query; };
      query.update = (values: Record<string, unknown>) => { patch = values; return query; };
      query.then = (resolve: (value: unknown) => unknown) => {
        if (patch) Object.assign(mocks.post, patch);
        const data = changedOnly !== null && mocks.post.status !== changedOnly ? [{ ...mocks.post }] : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      };
      return query;
    },
  }),
}));

const { scheduleFeedbackStatusSync } = await import("./status-sync");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deferred.length = 0;
  mocks.post.status = "open";
});

describe("scheduleFeedbackStatusSync", () => {
  it("maps the issue's current status even when background runs finish out of order", async () => {
    // Two quick moves: in_progress, then done. The later job runs first.
    scheduleFeedbackStatusSync("issue-1", "in_progress");
    scheduleFeedbackStatusSync("issue-1", "done");
    mocks.issueStatus.current = "done";
    await mocks.deferred[1]();
    await mocks.deferred[0]();
    expect(mocks.post.status).toBe("shipped");
  });

  it("schedules nothing for an unknown status", () => {
    scheduleFeedbackStatusSync("issue-1", "not-a-status");
    expect(mocks.deferred).toHaveLength(0);
  });

  it("leaves the post untouched when the issue is gone", async () => {
    mocks.issueStatus.current = null;
    scheduleFeedbackStatusSync("issue-1", "done");
    await mocks.deferred[0]();
    expect(mocks.post.status).toBe("open");
  });
});
