import { describe, expect, it } from "vitest";
import {
  forgeTimestamp,
  formatGithubCodeHeader,
  isGitlabBotLogin,
  mirroredCommentBody,
  mirrorFromGithubConversationComment,
  mirrorFromGithubReview,
  mirrorFromGithubReviewComment,
  mirrorFromGitlabNote,
  parseMirroredCodeComment,
  parseMirroredRemoteId,
  parseThreadKey,
  type GithubPrReviewCommentSource,
} from "@/lib/pr-comment-mirror";

/** The body a code comment root lands with. */
const formatMirroredCodeComment = (comment: GithubPrReviewCommentSource) =>
  [formatGithubCodeHeader(comment), comment.body ?? ""].filter(Boolean).join("\n\n");

const HUNK = [
  "@@ -10,6 +10,7 @@ export function probe() {",
  "   const a = 1;",
  "   const b = 2;",
  "-  return a + b;",
  "+  const c = 3;",
  "+  return a + b + c;",
].join("\n");

const human = { login: "octocat", type: "User" };
const bot = { login: "review-bot[bot]", type: "Bot" };

describe("mirrorFromGithubConversationComment", () => {
  const comment = {
    id: 41,
    body: "Looks good once the test passes.",
    user: human,
    author_association: "MEMBER",
    html_url: "https://github.com/acme/app/pull/7#issuecomment-41",
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:05:00Z",
  };

  it("keeps a human comment under its bare issue-comment id", () => {
    expect(mirrorFromGithubConversationComment(comment, "created")).toEqual({
      provider: "github",
      remoteCommentId: "41",
      threadKey: null,
      action: "created",
      body: "Looks good once the test passes.",
      codeHeader: null,
      authorLogin: "octocat",
      authorAssociation: "MEMBER",
      htmlUrl: "https://github.com/acme/app/pull/7#issuecomment-41",
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-20T10:05:00.000Z",
    });
  });

  it("drops bot comments and empty comments", () => {
    expect(mirrorFromGithubConversationComment({ ...comment, user: bot }, "created")).toBeNull();
    expect(mirrorFromGithubConversationComment({ ...comment, body: "  " }, "edited")).toBeNull();
  });

  it("still reports the deletion of a human comment", () => {
    expect(
      mirrorFromGithubConversationComment({ ...comment, body: "" }, "deleted")?.action,
    ).toBe("deleted");
  });
});

describe("mirrorFromGithubReviewComment", () => {
  const root = {
    id: 900,
    body: "This drops `b` when `c` is zero.",
    user: bot,
    path: "lib/probe.ts",
    line: 13,
    side: "RIGHT",
    diff_hunk: HUNK,
    created_at: "2026-10-20T11:00:00Z",
    updated_at: "2026-10-20T11:00:00Z",
  };

  it("keeps bot code comments, namespaced, with the code excerpt on the thread root", () => {
    const mirror = mirrorFromGithubReviewComment(root, "created")!;
    expect(mirror.remoteCommentId).toBe("review_comment:900");
    expect(mirror.threadKey).toBe("review_comment:900");
    expect(mirroredCommentBody(mirror, false)).toBe(
      [
        "`lib/probe.ts:13`",
        "",
        "```diff",
        "@@ -11,2 +11,3 @@",
        "   const b = 2;",
        "-  return a + b;",
        "+  const c = 3;",
        "+  return a + b + c;",
        "```",
        "",
        "This drops `b` when `c` is zero.",
      ].join("\n"),
    );
  });

  it("names the root's thread on a reply, which lands without the code", () => {
    const reply = mirrorFromGithubReviewComment(
      { ...root, id: 901, in_reply_to_id: 900, body: "Fixed in the next push.", user: human },
      "created",
    )!;
    expect(reply.threadKey).toBe("review_comment:900");
    expect(mirroredCommentBody(reply, true)).toBe("Fixed in the next push.");
  });
});

describe("mirrorFromGithubReview", () => {
  const review = {
    id: 77,
    body: "Two remarks inline, otherwise fine.",
    state: "CHANGES_REQUESTED",
    user: human,
    submitted_at: "2026-10-20T12:00:00Z",
  };

  it("keeps the written part of a human review", () => {
    expect(mirrorFromGithubReview(review, "created")).toMatchObject({
      remoteCommentId: "review:77",
      body: "Two remarks inline, otherwise fine.",
      createdAt: "2026-10-20T12:00:00.000Z",
      updatedAt: "2026-10-20T12:00:00.000Z",
    });
  });

  it("dates an edit by its delivery, since GitHub dates a review once", () => {
    expect(
      mirrorFromGithubReview(review, "edited", "2026-10-21T08:00:00.000Z")?.updatedAt,
    ).toBe("2026-10-21T08:00:00.000Z");
  });

  it("drops bare approvals, pending reviews and bot reviews", () => {
    expect(mirrorFromGithubReview({ ...review, body: "" }, "created")).toBeNull();
    expect(mirrorFromGithubReview({ ...review, state: "PENDING" }, "created")).toBeNull();
    expect(mirrorFromGithubReview({ ...review, user: bot }, "created")).toBeNull();
  });
});

describe("formatMirroredCodeComment / parseMirroredCodeComment", () => {
  it("round-trips the anchor, the excerpt and the text", () => {
    const body = formatMirroredCodeComment({
      body: "Nit: name it `total`.",
      path: "lib/probe.ts",
      line: 13,
      diff_hunk: HUNK,
    });
    expect(parseMirroredCodeComment(body)).toEqual({
      path: "lib/probe.ts",
      line: 13,
      startLine: null,
      side: "RIGHT",
      diffHunk: [
        "@@ -11,2 +11,3 @@",
        "   const b = 2;",
        "-  return a + b;",
        "+  const c = 3;",
        "+  return a + b + c;",
      ].join("\n"),
      body: "Nit: name it `total`.",
    });
  });

  it("keeps a multi-line range on the commented lines only", () => {
    const parsed = parseMirroredCodeComment(
      formatMirroredCodeComment({
        body: "Merge these.",
        path: "lib/probe.ts",
        start_line: 12,
        line: 13,
        side: "RIGHT",
        diff_hunk: HUNK,
      }),
    );
    expect(parsed).toMatchObject({ line: 13, startLine: 12, side: "RIGHT" });
    expect(parsed?.diffHunk?.split("\n")).toEqual([
      "@@ -12,0 +12,2 @@",
      "+  const c = 3;",
      "+  return a + b + c;",
    ]);
  });

  it("reads a range on removed lines back as the base side", () => {
    const parsed = parseMirroredCodeComment(
      formatMirroredCodeComment({
        body: "Why remove this?",
        path: "lib/probe.ts",
        start_line: 11,
        line: 12,
        side: "LEFT",
        diff_hunk: ["@@ -10,3 +10,1 @@", "   const a = 1;", "-  const b = 2;", "-  return a + b;"].join("\n"),
      }),
    );
    expect(parsed).toMatchObject({ startLine: 11, line: 12, side: "LEFT" });
  });

  it("anchors an outdated comment on its original line", () => {
    const body = formatMirroredCodeComment({
      body: "Still relevant?",
      path: "lib/probe.ts",
      line: null,
      original_line: 13,
      diff_hunk: HUNK,
    });
    expect(body.startsWith("`lib/probe.ts:13`")).toBe(true);
  });

  it("lengthens the fence when the code itself contains backticks", () => {
    const body = formatMirroredCodeComment({
      body: "Escape this.",
      path: "README.md",
      line: 2,
      diff_hunk: ["@@ -1,1 +1,2 @@", " intro", "+```ts"].join("\n"),
    });
    expect(body).toContain("````diff");
    expect(parseMirroredCodeComment(body)?.body).toBe("Escape this.");
  });

  it("does not mistake an ordinary comment for an excerpt", () => {
    expect(parseMirroredCodeComment("`lib/probe.ts` is fine.")).toBeNull();
    expect(parseMirroredCodeComment("Plain text.")).toBeNull();
  });

  it("keeps only the anchor when the forge served no hunk, and reads it back", () => {
    const body = formatMirroredCodeComment({ body: "Hm.", path: "a.ts", line: 3, diff_hunk: "" });
    expect(body).toBe("`a.ts:3`\n\nHm.");
    expect(parseMirroredCodeComment(body)).toMatchObject({ path: "a.ts", line: 3, diffHunk: null, body: "Hm." });
  });
});

describe("mirrorFromGitlabNote", () => {
  const note = {
    id: 55,
    body: "Can this be null?",
    type: "DiffNote",
    position: { new_path: "app/model.rb", new_line: 12 },
    authorLogin: "jdoe",
    url: "https://gitlab.com/acme/app/-/merge_requests/3#note_55",
    created_at: "2026-10-10 09:00:00 UTC",
    updated_at: "2026-10-10 09:00:00 UTC",
    discussionId: "6a9c1750b37d513a43987b574953fceb50b03ce7",
  };

  it("keys a diff note by its discussion, anchored on its file and line", () => {
    const mirror = mirrorFromGitlabNote(note, "created")!;
    expect(mirror).toMatchObject({
      provider: "gitlab",
      remoteCommentId: "gitlab_diff_note:55",
      threadKey: "gitlab_discussion:6a9c1750b37d513a43987b574953fceb50b03ce7",
      createdAt: "2026-10-10T09:00:00.000Z",
    });
    expect(mirroredCommentBody(mirror, false)).toBe("`app/model.rb:12`\n\nCan this be null?");
  });

  it("drops system notes and bot conversation, but keeps bot diff notes", () => {
    expect(mirrorFromGitlabNote({ ...note, system: true }, "created")).toBeNull();
    expect(mirrorFromGitlabNote(
      { ...note, type: null, position: null, authorLogin: "project_42_bot_3f2a" }, "created")).toBeNull();
    expect(mirrorFromGitlabNote({ ...note, authorLogin: "project_42_bot_3f2a" }, "created")).not.toBeNull();
    expect(mirrorFromGitlabNote({ ...note, type: null, position: null }, "created")?.remoteCommentId)
      .toBe("gitlab_note:55");
  });
});

describe("sidecar keys and forge time", () => {
  it("reads each key back as its forge, kind and forge id", () => {
    expect(parseMirroredRemoteId("41")).toEqual({ provider: "github", kind: "conversation", forgeId: 41 });
    expect(parseMirroredRemoteId("review_comment:9")).toEqual({ provider: "github", kind: "code", forgeId: 9 });
    expect(parseMirroredRemoteId("review:7")).toEqual({ provider: "github", kind: "review", forgeId: 7 });
    expect(parseMirroredRemoteId("gitlab_diff_note:5")).toEqual({ provider: "gitlab", kind: "code", forgeId: 5 });
    expect(parseMirroredRemoteId("gitlab_note:5")).toEqual({ provider: "gitlab", kind: "conversation", forgeId: 5 });
    expect(parseMirroredRemoteId("weird:5")).toBeNull();
  });

  it("names the thread the forge pairs states on", () => {
    expect(parseThreadKey("review_comment:900")).toEqual({ rootCommentId: 900 });
    expect(parseThreadKey("gitlab_discussion:abc")).toEqual({ discussionId: "abc" });
    expect(parseThreadKey(null)).toBeNull();
  });

  it("keeps the date a comment was written, whatever the forge's format", () => {
    expect(forgeTimestamp("2026-10-10 09:00:00 UTC")).toBe("2026-10-10T09:00:00.000Z");
    expect(forgeTimestamp("2026-10-10T09:00:00+02:00")).toBe("2026-10-10T07:00:00.000Z");
    expect(forgeTimestamp("not a date")).toBeNull();
    expect(forgeTimestamp(`2026-10-10${" ".repeat(50_000)}x`)).toBeNull();
  });

  it("recognizes GitLab machine accounts by their fixed naming", () => {
    expect(isGitlabBotLogin("group_7_bot_ab12")).toBe(true);
    expect(isGitlabBotLogin("service_account_group_7_x")).toBe(true);
    expect(isGitlabBotLogin("robert")).toBe(false);
  });
});
