import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  issue: { id: "issue-a" } as { id: string } | null,
  origin: null as Record<string, unknown> | null,
  originalBody: "Why not reuse the helper?\nIt already exists.",
  scope: { canWrite: true } as { canWrite: boolean } | null,
  createPrReviewCommentResponse: vi.fn(),
  createPrCommentResponse: vi.fn(),
  syncPrCommentToIssues: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    const query = { select: () => query, eq: () => query, is: () => query,
      maybeSingle: async () => ({ data: mocks.issue, error: null }) };
    return query;
  },
}));
vi.mock("@/lib/server/comment-store", () => ({
  readSyncedForgeComment: async () => mocks.origin,
  commentStore: () => {
    const query = { select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: { body: mocks.originalBody }, error: null }) };
    return query;
  },
}));
vi.mock("./pull-requests", () => ({
  findPullRequest: async () => ({ id: "pr-1", provider: "github", repo_full_name: "acme/app", number: 7 }),
}));
vi.mock("./pr-actions", () => ({
  resolvePrScope: async () => mocks.scope,
  createPrReviewCommentResponse: mocks.createPrReviewCommentResponse,
  createPrCommentResponse: mocks.createPrCommentResponse,
}));
vi.mock("./pr-comment-sync", () => ({ syncPrCommentToIssues: mocks.syncPrCommentToIssues }));

const { forgeReplyResponse, quoteForReply } = await import("./pr-comment-reply");

const reply = (body: unknown = "Done in abc123.") =>
  forgeReplyResponse({ userId: "user-1", supabase: {} as never, issueId: "issue-a", commentId: "comment-1", body });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.issue = { id: "issue-a" };
  mocks.scope = { canWrite: true };
  mocks.origin = { remoteCommentId: "review_comment:900", provider: "github", pullRequestId: "pr-1",
    threadKey: "review_comment:900" };
  mocks.createPrReviewCommentResponse.mockResolvedValue(NextResponse.json({
    comment: { id: 901, body: "Done in abc123.", user: { login: "camille" }, in_reply_to_id: 900,
      path: "a.ts", line: 3, diff_hunk: "", created_at: "2026-10-26T10:00:00Z", html_url: "https://x" },
  }));
  mocks.createPrCommentResponse.mockResolvedValue(NextResponse.json({
    comment: { id: 77, body: "quoted", user: { login: "camille" }, created_at: "2026-10-26T10:00:00Z",
      html_url: "https://y" },
  }));
});

describe("forgeReplyResponse", () => {
  it("replies in the forge thread of a code comment, then mirrors the reply at once", async () => {
    const response = await reply();
    expect(response.status).toBe(200);
    expect(mocks.createPrReviewCommentResponse).toHaveBeenCalledWith(
      { canWrite: true }, { body: "Done in abc123.", inReplyTo: 900 }, "user-1");
    expect(mocks.syncPrCommentToIssues).toHaveBeenCalledWith({
      provider: "github",
      repoFullName: "acme/app",
      prNumber: 7,
      mirror: expect.objectContaining({
        remoteCommentId: "review_comment:901",
        threadKey: "review_comment:900",
        replyToRemoteCommentId: "review_comment:900",
        authorLogin: "camille",
      }),
    });
  });

  it("answers a GitHub conversation comment with a quoting comment", async () => {
    mocks.origin = { remoteCommentId: "41", provider: "github", pullRequestId: "pr-1", threadKey: null };
    await reply();
    expect(mocks.createPrCommentResponse).toHaveBeenCalledWith({ canWrite: true },
      "> Why not reuse the helper?\n> It already exists.\n\nDone in abc123.", "user-1", {});
    expect(mocks.syncPrCommentToIssues).toHaveBeenCalledWith(expect.objectContaining({
      mirror: expect.objectContaining({ remoteCommentId: "77", replyToRemoteCommentId: "41" }),
    }));
  });

  it("replies in the discussion of any GitLab note", async () => {
    mocks.origin = { remoteCommentId: "gitlab_note:12", provider: "gitlab", pullRequestId: "pr-1",
      threadKey: "gitlab_discussion:d1" };
    mocks.createPrReviewCommentResponse.mockResolvedValue(NextResponse.json({
      comment: { id: 13, body: "Sure.", user: { login: "camille" }, created_at: "2026-10-26T10:00:00Z" },
    }));
    await reply("Sure.");
    expect(mocks.createPrReviewCommentResponse).toHaveBeenCalledWith(
      { canWrite: true }, { body: "Sure.", inReplyTo: 12 }, "user-1");
    expect(mocks.syncPrCommentToIssues).toHaveBeenCalledWith(expect.objectContaining({
      provider: "gitlab",
      mirror: expect.objectContaining({ remoteCommentId: "gitlab_note:13", threadKey: "gitlab_discussion:d1" }),
    }));
  });

  it("refuses readers, foreign comments and empty answers", async () => {
    mocks.scope = { canWrite: false };
    expect((await reply()).status).toBe(403);
    mocks.scope = { canWrite: true };
    mocks.origin = { remoteCommentId: "41", provider: "github", pullRequestId: null, threadKey: null };
    expect((await reply()).status).toBe(404);
    mocks.issue = null;
    expect((await reply()).status).toBe(404);
    expect((await reply("   ")).status).toBe(400);
    expect(mocks.createPrReviewCommentResponse).not.toHaveBeenCalled();
    expect(mocks.createPrCommentResponse).not.toHaveBeenCalled();
  });

  it("returns the forge refusal untouched and mirrors nothing", async () => {
    mocks.createPrReviewCommentResponse.mockResolvedValue(
      NextResponse.json({ error: "gitAccountRequired", code: "gitAccountRequired" }, { status: 403 }));
    const response = await reply();
    expect(response.status).toBe(403);
    expect(mocks.syncPrCommentToIssues).not.toHaveBeenCalled();
  });
});

describe("quoteForReply", () => {
  it("quotes the first three lines of the answered comment", () => {
    expect(quoteForReply("a\n\nb\nc\nd", "ok")).toBe("> a\n> b\n> c\n>\n> …\n\nok");
    expect(quoteForReply("", "ok")).toBe("ok");
  });
});
