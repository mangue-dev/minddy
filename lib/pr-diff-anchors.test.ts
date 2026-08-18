import { describe, expect, it } from "vitest";
import { parsePatchFiles, type Hunk } from "@pierre/diffs";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import {
  anchorKey,
  commentAnchor,
  isLineInDiff,
  lineKind,
  sharedStartLine,
  threadAnchor,
  toDiffSide,
  toGithubSide,
} from "@/lib/pr-diff-anchors";

/**
 * The cases below reproduce the REAL behavior of the GitHub API, noted
 * against a real PR: it dictates the rules, not intuition.
 */

/** Diff whose ONLY hunk touches line 150 (context 147→153). */
const DIFF = `diff --git a/probe.txt b/probe.txt
--- a/probe.txt
+++ b/probe.txt
@@ -147,7 +147,7 @@
 line 147: content
 line 148: content
 line 149: content
-line 150: content
+line 150: changed
 line 151: content
 line 152: content
 line 153: content
`;

const HUNKS: Hunk[] = parsePatchFiles(DIFF)[0].files[0].hunks;

function comment(over: Partial<PullRequestReviewComment> = {}): PullRequestReviewComment {
  return {
    id: 1,
    body: "body",
    path: "probe.txt",
    line: 150,
    original_line: 150,
    side: "RIGHT",
    start_line: null,
    start_side: null,
    in_reply_to_id: null,
    review_id: null,
    diff_hunk: "@@ -147,7 +147,7 @@",
    user: { login: "someone", avatar_url: null },
    created_at: "2026-07-17T10:00:00Z",
    html_url: "https://github.com/o/r/pull/1#discussion_r1",
    ...over,
  };
}

describe("toDiffSide / toGithubSide", () => {
  it("pairs the two vocabularies on the same side", () => {
    expect(toDiffSide("LEFT")).toBe("deletions");
    expect(toDiffSide("RIGHT")).toBe("additions");
    expect(toGithubSide("deletions")).toBe("LEFT");
    expect(toGithubSide("additions")).toBe("RIGHT");
  });
});

describe("threadAnchor", () => {
  it("anchors a right-side comment on the new line", () => {
    const [thread] = groupReviewThreads([comment({ line: 150, side: "RIGHT" })]);
    expect(threadAnchor(thread)).toEqual({ side: "additions", line: 150 });
  });

  it("anchors a left-side comment on the old line", () => {
    const [thread] = groupReviewThreads([comment({ line: 150, side: "LEFT" })]);
    expect(threadAnchor(thread)).toEqual({ side: "deletions", line: 150 });
  });

  it("n'ancre rien quand GitHub a effacé la ligne", () => {
    const [thread] = groupReviewThreads([comment({ line: null, original_line: 150 })]);
    expect(threadAnchor(thread)).toBeNull();
  });

  it("rend l'ancre DÉCLARÉE, même hors des hunks — c'est le rendu qui tranche", () => {
    // The trap case: noted on the real API, a comment made on a
    // CONTEXT line keeps its `line` after the diff has moved elsewhere. We
    // don't declare it obsolete here: the lib will simply not create `<slot>`
    // for this line, and it will fall back into “expired” — until
    // that a context unfolding brings it back to its place, without recalculating anything.
    const [thread] = groupReviewThreads([comment({ line: 97, side: "RIGHT" })]);
    expect(threadAnchor(thread)).toEqual({ side: "additions", line: 97 });
    expect(isLineInDiff(HUNKS, "additions", 97)).toBe(false);
  });
});

describe("anchorKey", () => {
  it("separates the two sides of the same line number", () => {
    // In unified, a modified line produces TWO lines numbered 150: the
    // deleted and added it. They do not share annotations or drafts.
    expect(anchorKey({ side: "deletions", line: 150 })).not.toBe(
      anchorKey({ side: "additions", line: 150 }),
    );
  });
});

describe("isLineInDiff", () => {
  it("keeps hunk lines on both sides", () => {
    expect(isLineInDiff(HUNKS, "additions", 147)).toBe(true);
    expect(isLineInDiff(HUNKS, "additions", 153)).toBe(true);
    expect(isLineInDiff(HUNKS, "deletions", 150)).toBe(true);
  });

  it("EXCLUDES what is outside the hunk — GitHub rejects it with 422", () => {
    // These lines exist in the file and are displayed once the context
    // unfolded: they are however NOT in the difficulty that the forge is experiencing.
    expect(isLineInDiff(HUNKS, "additions", 146)).toBe(false);
    expect(isLineInDiff(HUNKS, "additions", 154)).toBe(false);
    expect(isLineInDiff(HUNKS, "additions", 97)).toBe(false);
  });
});

describe("lineKind", () => {
  it("distingue l'ajout, la suppression et le contexte au même numéro", () => {
    expect(lineKind(HUNKS, "additions", 150)).toBe("added");
    expect(lineKind(HUNKS, "deletions", 150)).toBe("removed");
    expect(lineKind(HUNKS, "additions", 148)).toBe("context");
    expect(lineKind(HUNKS, "deletions", 152)).toBe("context");
  });

  it("ne dit rien d'une ligne hors hunk", () => {
    expect(lineKind(HUNKS, "additions", 97)).toBeNull();
  });
});

describe("commentAnchor", () => {
  const range = (over: Partial<Parameters<typeof commentAnchor>[1]> = {}) => ({
    start: 150,
    end: 150,
    side: "additions" as const,
    ...over,
  });

  it("anchors a simple click on the targeted line", () => {
    expect(commentAnchor(HUNKS, range(), { multiLine: true })).toEqual({
      side: "additions",
      line: 150,
    });
  });

  it("rejects a line outside the diff instead of offering a request doomed to 422", () => {
    expect(commentAnchor(HUNKS, range({ start: 97, end: 97 }), { multiLine: true })).toBeNull();
  });

  it("orders a range by file position regardless of drag direction", () => {
    const down = commentAnchor(HUNKS, range({ start: 148, end: 152 }), { multiLine: true });
    const up = commentAnchor(HUNKS, range({ start: 152, end: 148 }), { multiLine: true });
    // GitHub wants `line` = LAST line and `start_line` = the first.
    expect(down).toEqual({
      side: "additions",
      line: 152,
      startLine: 148,
      startSide: "additions",
    });
    expect(up).toEqual(down);
  });

  it("moves the range to its destination line when it changes sides", () => {
    const anchor = commentAnchor(
      HUNKS,
      range({ start: 150, side: "deletions", end: 152, endSide: "additions" }),
      { multiLine: true },
    );
    expect(anchor).toEqual({ side: "additions", line: 152 });
  });

  it("moves the range to its destination line where ranges do not exist (GitLab)", () => {
    const anchor = commentAnchor(HUNKS, range({ start: 148, end: 152 }), { multiLine: false });
    expect(anchor).toEqual({ side: "additions", line: 152 });
  });

  it("rejects a range with an endpoint outside the diff", () => {
    expect(commentAnchor(HUNKS, range({ start: 145, end: 152 }), { multiLine: true })).toEqual({
      side: "additions",
      line: 152,
    });
    expect(commentAnchor(HUNKS, range({ start: 148, end: 160 }), { multiLine: true })).toBeNull();
  });
});

describe("sharedStartLine", () => {
  const thread = (id: number, start: number | null) =>
    groupReviewThreads([comment({ id, line: 15, start_line: start })])[0];

  it("returns the range when the only thread carries one", () => {
    expect(sharedStartLine([thread(1, 6)])).toBe(6);
  });

  it("returns nothing for a one-line comment", () => {
    expect(sharedStartLine([thread(1, null)])).toBeNull();
    expect(sharedStartLine([])).toBeNull();
  });

  it("stays silent when two threads on the same line cover different ranges", () => {
    // A single title cannot say two ranges: we then fall back on the
    // anchor line, which remains true for both.
    expect(sharedStartLine([thread(1, 6), thread(2, 9)])).toBeNull();
    expect(sharedStartLine([thread(1, 6), thread(2, null)])).toBeNull();
  });
});
