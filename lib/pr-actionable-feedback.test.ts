import { describe, expect, it } from "vitest";

import { toActionablePrLineThreads } from "./server/agent/prompt";

const comment = (id: number, line: number | null) => ({
  id,
  in_reply_to_id: null,
  created_at: `2026-09-01T12:00:0${id}Z`,
  body: `feedback ${id}`,
  path: "src/example.ts",
  line,
  start_line: null,
  side: "RIGHT" as const,
  diff_hunk: "@@ -1 +1 @@\n-old\n+new",
  user: { login: "reviewer" },
});

describe("actionable pull request feedback", () => {
  it("keeps unresolved current-head threads from human and automated reviewers", () => {
    const threads = toActionablePrLineThreads(
      [comment(1, 10), { ...comment(2, 20), user: { login: "review-bot" } }],
      [
        { rootCommentId: 1, threadId: "human", resolved: false, resolvedBy: null },
        { rootCommentId: 2, threadId: "bot", resolved: false, resolvedBy: null },
      ],
    );
    expect(threads.map((thread) => thread.comments[0].author)).toEqual([
      "reviewer",
      "review-bot",
    ]);
  });

  it("excludes resolved and outdated threads", () => {
    const threads = toActionablePrLineThreads(
      [comment(1, 10), comment(2, null)],
      [
        { rootCommentId: 1, threadId: "resolved", resolved: true, resolvedBy: "maintainer" },
        { rootCommentId: 2, threadId: "outdated", resolved: false, resolvedBy: null },
      ],
    );
    expect(threads).toEqual([]);
  });
});
