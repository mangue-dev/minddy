import { describe, expect, it } from "vitest";

import type { PullRequestReviewComment } from "./agent-api";
import type { ReviewThreadState } from "./pr-review-threads";
import {
  buildPullRequestFeedbackPrompt,
  conversationReviewerGroups,
  unresolvedReviewThreads,
} from "./pr-unresolved-conversations";

function comment(
  id: number,
  body: string,
  options: Partial<PullRequestReviewComment> = {},
): PullRequestReviewComment {
  return {
    id,
    body,
    path: "components/button.tsx",
    line: 42,
    original_line: 42,
    side: "RIGHT",
    start_line: null,
    original_start_line: null,
    start_side: null,
    in_reply_to_id: null,
    review_id: 10,
    diff_hunk: "@@ -40,3 +40,3 @@",
    user: { login: "reviewer", avatar_url: null },
    created_at: `2026-09-01T10:00:${String(id).padStart(2, "0")}Z`,
    html_url: `https://example.test/comments/${id}`,
    ...options,
  };
}

const states: ReviewThreadState[] = [
  {
    rootCommentId: 1,
    threadId: "thread-1",
    resolved: false,
    resolvedBy: null,
    outdated: true,
  },
  {
    rootCommentId: 3,
    threadId: "thread-3",
    resolved: true,
    resolvedBy: "maintainer",
  },
];

describe("unresolved pull request conversations", () => {
  it("keeps only threads with a known unresolved state", () => {
    const threads = unresolvedReviewThreads(
      [
        comment(1, "Use the shared badge style."),
        comment(2, "Agreed.", { in_reply_to_id: 1 }),
        comment(3, "Rename this helper."),
        comment(4, "State unavailable."),
      ],
      states,
    );

    expect(threads).toHaveLength(1);
    expect(threads[0]?.comments.map((entry) => entry.id)).toEqual([1, 2]);
  });

  it("builds a portable prompt with PR, branch, location, and message context", () => {
    const [thread] = unresolvedReviewThreads(
      [comment(1, "Use the shared badge style."), comment(2, "Agreed.", { in_reply_to_id: 1 })],
      states,
    );
    const prompt = buildPullRequestFeedbackPrompt(
      {
        number: 106,
        title: "Refine pull request review controls",
        url: "https://github.com/mangue-dev/minddy/pull/106",
        base: "main",
        head: "work/review-controls",
      },
      [thread],
    );

    expect(prompt).toContain("Pull request: #106 — Refine pull request review controls");
    expect(prompt).toContain("Base branch: main");
    expect(prompt).toContain("Head branch: work/review-controls");
    expect(prompt).toContain("components/button.tsx:42 (outdated code context)");
    expect(prompt).toContain("@reviewer:\nUse the shared badge style.");
    expect(prompt).toContain("@reviewer:\nAgreed.");
  });
});


describe("conversationReviewerGroups", () => {
  it("keeps resolved threads last and groups roots by reviewer without counting replies", () => {
    const threads = [
      {
        id: 3,
        root: comment(3, "Done", { user: { login: "Ada", avatar_url: null } }),
        comments: [comment(3, "Done")],
        resolution: states[1],
      },
      {
        id: 1,
        root: comment(1, "Fix"),
        comments: [comment(1, "Fix"), comment(2, "Reply")],
        resolution: states[0],
      },
      {
        id: 4,
        root: comment(4, "Unknown state", {
          user: { login: "Reviewer", avatar_url: null },
        }),
        comments: [comment(4, "Unknown state")],
      },
      {
        id: 5,
        root: comment(5, "Another reviewer", { user: null }),
        comments: [comment(5, "Another reviewer")],
        resolution: { ...states[0], rootCommentId: 5 },
      },
    ];
    const groups = conversationReviewerGroups(threads);
    expect(
      groups.map((group) => [
        group.resolved,
        group.threads.map((thread) => thread.id),
      ]),
    ).toEqual([
      [false, [1]],
      [false, [5]],
      [undefined, [4]],
      [true, [3]],
    ]);
    expect(groups[0].threads[0].comments).toHaveLength(2);
    expect(conversationReviewerGroups([])).toEqual([]);
    expect(threads.map((thread) => thread.id)).toEqual([3, 1, 4, 5]);
  });

  it("does not label conversations open when all thread states are unavailable", () => {
    const threads = [
      { id: 1, root: comment(1, "State unavailable"), comments: [comment(1, "State unavailable")] },
      { id: 2, root: comment(2, "Also unavailable"), comments: [comment(2, "Also unavailable")] },
    ];
    const groups = conversationReviewerGroups(threads);
    expect(groups).toHaveLength(1);
    expect(groups[0].resolved).toBeUndefined();
    expect(groups[0].threads).toHaveLength(2);
  });
});
