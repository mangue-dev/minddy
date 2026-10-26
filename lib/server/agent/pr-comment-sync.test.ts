import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrCommentMirror } from "@/lib/pr-comment-mirror";

const mocks = vi.hoisted(() => ({
  findPullRequestByNumber: vi.fn(),
  pullRequestIssueIds: vi.fn(),
  repoWriteActor: vi.fn(),
  mirrorGithubCommentToIssue: vi.fn(),
  findSyncedThreadRoot: vi.fn(),
  finishSyncedForgeComment: vi.fn(),
  resolveRepoCloneTarget: vi.fn(),
  listPullRequestMirrorSources: vi.fn(),
  listMergeRequestMirrorSources: vi.fn(),
  issueProject: { project_id: "project-1" } as { project_id: string } | null,
  links: [] as { issue_id: string; comments_backfilled_at: string | null }[],
}));

/** `pull_request_issues` with the claim semantics: `is(null)` + update. */
function linksTable() {
  let patch: Record<string, unknown> | null = null;
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  const query: Record<string, unknown> = {};
  const rows = () => mocks.links.filter((row) => filters.every((f) => f(row)));
  query.select = () => query;
  query.update = (values: Record<string, unknown>) => { patch = values; return query; };
  query.eq = (column: string, value: unknown) => {
    if (column !== "pull_request_id") filters.push((row) => row[column] === value);
    return query;
  };
  query.is = (column: string) => { filters.push((row) => row[column] === null); return query; };
  query.then = (resolve: (value: unknown) => unknown) => {
    const matched = rows();
    if (patch) for (const row of matched) Object.assign(row, patch);
    return Promise.resolve({ data: matched.map((row) => ({ issue_id: row.issue_id })), error: null }).then(resolve);
  };
  return query;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => linksTable() }),
}));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    const query = { select: () => query, eq: () => query, is: () => query,
      maybeSingle: async () => ({ data: mocks.issueProject, error: null }) };
    return query;
  },
}));
vi.mock("./pull-requests", () => ({
  findPullRequestByNumber: mocks.findPullRequestByNumber,
  pullRequestIssueIds: mocks.pullRequestIssueIds,
  rowProvider: (row: { provider: string }) => row.provider,
}));
vi.mock("./pr-activity", () => ({ repoWriteActor: mocks.repoWriteActor }));
vi.mock("@/lib/server/git/issue-sync", () => ({
  mirrorGithubCommentToIssue: mocks.mirrorGithubCommentToIssue,
}));
vi.mock("@/lib/server/comment-store", () => ({
  findSyncedThreadRoot: mocks.findSyncedThreadRoot,
  finishSyncedForgeComment: mocks.finishSyncedForgeComment,
}));
vi.mock("./repo-access", () => ({ resolveRepoCloneTarget: mocks.resolveRepoCloneTarget }));
vi.mock("./pr", () => ({ listPullRequestMirrorSources: mocks.listPullRequestMirrorSources }));
vi.mock("./mr", () => ({ listMergeRequestMirrorSources: mocks.listMergeRequestMirrorSources }));

const { backfillPendingPrComments, syncPrCommentToIssues } = await import("./pr-comment-sync");

const PR = { id: "pr-1", provider: "github", repo_full_name: "acme/app", number: 7 };

const mirror = (overrides: Partial<PrCommentMirror> = {}): PrCommentMirror => ({
  provider: "github",
  remoteCommentId: "review_comment:2",
  threadKey: "review_comment:1",
  action: "created",
  body: "Agreed.",
  codeHeader: "`a.ts:1`",
  authorLogin: "octocat",
  authorAssociation: "MEMBER",
  htmlUrl: null,
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.issueProject = { project_id: "project-1" };
  mocks.links = [];
  mocks.findPullRequestByNumber.mockResolvedValue(PR);
  mocks.pullRequestIssueIds.mockResolvedValue(["issue-a", "issue-b"]);
  mocks.repoWriteActor.mockImplementation(async ({ issueId }: { issueId: string }) =>
    issueId === "issue-a" ? "linker" : null);
  mocks.findSyncedThreadRoot.mockResolvedValue("comment-1");
  mocks.mirrorGithubCommentToIssue.mockResolvedValue("comment-2");
});

describe("syncPrCommentToIssues", () => {
  it("writes a reply without its code header, then records its origin and parent", async () => {
    await syncPrCommentToIssues({ provider: "github", repoFullName: "acme/app", prNumber: 7, mirror: mirror() });

    expect(mocks.mirrorGithubCommentToIssue).toHaveBeenCalledOnce();
    expect(mocks.mirrorGithubCommentToIssue).toHaveBeenCalledWith({
      issueId: "issue-a",
      authorId: "linker",
      comment: expect.objectContaining({ remoteCommentId: "review_comment:2", body: "Agreed." }),
    });
    expect(mocks.finishSyncedForgeComment).toHaveBeenCalledWith(expect.anything(), {
      issueId: "issue-a",
      commentId: "comment-2",
      remoteCommentId: "review_comment:2",
      provider: "github",
      pullRequestId: "pr-1",
      threadKey: "review_comment:1",
      parentCommentId: "comment-1",
    });
  });

  it("writes a thread root with its code header", async () => {
    mocks.findSyncedThreadRoot.mockResolvedValue(null);
    await syncPrCommentToIssues({ provider: "github", repoFullName: "acme/app", prNumber: 7, mirror: mirror() });
    expect(mocks.mirrorGithubCommentToIssue).toHaveBeenCalledWith(expect.objectContaining({
      comment: expect.objectContaining({ body: "`a.ts:1`\n\nAgreed." }),
    }));
  });

  it("does not record a stale delivery, nor thread a deletion", async () => {
    mocks.mirrorGithubCommentToIssue.mockResolvedValueOnce(null);
    await syncPrCommentToIssues({ provider: "github", repoFullName: "acme/app", prNumber: 7, mirror: mirror() });
    expect(mocks.finishSyncedForgeComment).not.toHaveBeenCalled();

    await syncPrCommentToIssues({
      provider: "github", repoFullName: "acme/app", prNumber: 7, mirror: mirror({ action: "deleted" }),
    });
    expect(mocks.finishSyncedForgeComment).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ parentCommentId: null }));
  });

  it("keeps going when one ticket fails, and skips a PR minddy does not track", async () => {
    mocks.repoWriteActor.mockResolvedValue("linker");
    mocks.mirrorGithubCommentToIssue.mockRejectedValueOnce(new Error("boom"));
    await syncPrCommentToIssues({ provider: "github", repoFullName: "acme/app", prNumber: 7, mirror: mirror() });
    expect(mocks.mirrorGithubCommentToIssue).toHaveBeenCalledTimes(2);

    mocks.findPullRequestByNumber.mockResolvedValueOnce(null);
    mocks.mirrorGithubCommentToIssue.mockClear();
    await syncPrCommentToIssues({ provider: "github", repoFullName: "acme/app", prNumber: 8, mirror: mirror() });
    expect(mocks.mirrorGithubCommentToIssue).not.toHaveBeenCalled();
  });
});

describe("backfillPendingPrComments", () => {
  beforeEach(() => {
    mocks.resolveRepoCloneTarget.mockResolvedValue({ provider: "github", token: "ghs_test" });
    mocks.findSyncedThreadRoot.mockResolvedValue(null);
    mocks.listPullRequestMirrorSources.mockResolvedValue({
      reviews: [{ id: 5, state: "APPROVED", body: "Ship it.", user: { login: "lead" },
        submitted_at: "2026-10-20T12:00:00Z" }],
      comments: [
        { id: 10, body: "First!", user: { login: "octocat" }, created_at: "2026-10-01T09:00:00Z" },
        { id: 11, body: "Preview ready", user: { login: "ci[bot]", type: "Bot" },
          created_at: "2026-10-20T09:30:00Z" },
      ],
      reviewComments: [
        { id: 1, body: "Rename?", user: { login: "lint[bot]", type: "Bot" }, path: "a.ts", line: 1,
          diff_hunk: "@@ -0,0 +1,1 @@\n+x", created_at: "2026-10-20T10:00:00Z" },
        { id: 2, in_reply_to_id: 1, body: "Done.", user: { login: "octocat" },
          created_at: "2026-10-20T11:00:00Z" },
      ],
    });
  });

  it("imports each new link once, oldest first, with the dates the forge wrote", async () => {
    mocks.links = [
      { issue_id: "issue-a", comments_backfilled_at: null },
      { issue_id: "issue-b", comments_backfilled_at: "2026-10-25T00:00:00Z" },
    ];
    await backfillPendingPrComments(PR as never);

    const calls = mocks.mirrorGithubCommentToIssue.mock.calls.map(([call]) => call);
    expect(calls.every((call) => call.issueId === "issue-a")).toBe(true);
    expect(calls.map((call) => call.comment.remoteCommentId))
      .toEqual(["10", "review_comment:1", "review_comment:2", "review:5"]);
    expect(calls[0].comment.createdAt).toBe("2026-10-01T09:00:00.000Z");
    expect(mocks.links[0].comments_backfilled_at).not.toBeNull();

    mocks.mirrorGithubCommentToIssue.mockClear();
    await backfillPendingPrComments(PR as never);
    expect(mocks.mirrorGithubCommentToIssue).not.toHaveBeenCalled();
  });

  it("releases the claim when the forge read fails, so the next PR event retries", async () => {
    mocks.links = [{ issue_id: "issue-a", comments_backfilled_at: null }];
    mocks.listPullRequestMirrorSources.mockRejectedValueOnce(new Error("rate limited"));
    await backfillPendingPrComments(PR as never);
    expect(mocks.links[0].comments_backfilled_at).toBeNull();
  });

  it("reads a merge request's discussions on GitLab", async () => {
    mocks.links = [{ issue_id: "issue-a", comments_backfilled_at: null }];
    mocks.resolveRepoCloneTarget.mockResolvedValue({ provider: "gitlab", token: "glpat" });
    mocks.listMergeRequestMirrorSources.mockResolvedValue([
      { id: 1, body: "added 2 commits", system: true, discussionId: "d0", created_at: "2026-10-01T08:00:00Z" },
      { id: 2, body: "Why?", type: "DiffNote", position: { new_path: "a.rb", new_line: 3 },
        authorLogin: "jdoe", discussionId: "d1", created_at: "2026-10-01T09:00:00Z" },
    ]);
    await backfillPendingPrComments({ ...PR, provider: "gitlab" } as never);
    expect(mocks.mirrorGithubCommentToIssue).toHaveBeenCalledOnce();
    expect(mocks.mirrorGithubCommentToIssue).toHaveBeenCalledWith(expect.objectContaining({
      comment: expect.objectContaining({ provider: "gitlab", remoteCommentId: "gitlab_diff_note:2",
        threadKey: "gitlab_discussion:d1" }),
    }));
  });
});
