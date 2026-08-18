import type { Hunk, SelectedLineRange } from "@pierre/diffs";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import type { ReviewThread } from "@/lib/pr-review-threads";

/**
 * Where a remark clings to the diff: the translation between the vocabulary of the
 * forge (`side: "LEFT" | "RIGHT"`, line number) and that of `@pierre/diffs`
 * (`side: "deletions" | "additions"`), plus the rule of 422.
 *
 * Separated from bundling (`pr-review-threads`, pure and shared with the server)
 * and rendering, as `pr-review-diff` was before him: the two rules
 * below are subtle, dictated by the ACTUAL behavior of the GitHub API,
 * and they can be tested without React.
 */

/** A client-side review thread — the one handled by the diff view and its annotations. */
export type PrReviewThread = ReviewThread<PullRequestReviewComment>;

/** Side of a line at Pierre. GitHub names the same two sides LEFT/RIGHT. */
export type DiffSide = "deletions" | "additions";

/** Anchor of a line, in the vocabulary of sight. */
export interface LineAnchor {
  side: DiffSide;
  line: number;
}

/**
 * Anchor a comment to send. `startLine` is only set for one
 * multi-line note: GitHub then expects `line` = LAST line of the
 * range and `start_line` = the first.
 */
export interface CommentAnchor extends LineAnchor {
  startLine?: number;
  startSide?: DiffSide;
}

export function toGithubSide(side: DiffSide): "LEFT" | "RIGHT" {
  return side === "deletions" ? "LEFT" : "RIGHT";
}

export function toDiffSide(side: "LEFT" | "RIGHT"): DiffSide {
  return side === "LEFT" ? "deletions" : "additions";
}

/**
 * Identity of an anchor in the component tables (drafts, composers
 * open). Same form as the name of `<slot>` that the lib creates for a
 * annotation, which is not a coincidence: it is the same pair (side, line).
 */
export function anchorKey(anchor: LineAnchor): string {
  return `${anchor.side}:${anchor.line}`;
}

/**
 * Ligne d'ancrage d'un fil, ou `null` s'il n'en a plus.
 *
 * ⚠️ We make the anchor DECLARED, without checking that it falls in the diff: this is
 * the lib which decides, by only creating the corresponding `<slot>` if the line is
 * actually rendered. A thread whose line is hidden therefore reappears at its
 * place as soon as we unfold the context around it, without having to follow the state of
 * unfolding — and a wire whose line no longer exists in any hunk folds
 * in the “expired”, as before (see `placedAnchorKeys` in `pr-diff`).
 *
 * The test is NOT `line !== null` alone: ​​checked against the GitHub API, a
 * comment placed on a CONTEXT line keeps its `line` even once
 * the diff has moved elsewhere in the file. This is why the
 * “anchored or expired” decision is not made here.
 */
export function threadAnchor(thread: PrReviewThread): LineAnchor | null {
  const { line, side } = thread.root;
  if (line == null) return null;
  return { side: toDiffSide(side), line };
}

/**
 * Does a line belong to the hunks of the patch - so at the diff that the forge
 * knows?
 *
 * GitHub refuses (**422** `line: could not be resolved`) any comments on a
 * line out of diff, and the view displays it: context unfolding
 * brings back REAL lines but missing from the patch. The hunks passed here are
 * those of the original patch — the lib keeps its unfolded state separately and does not
 * not touch, which makes this test the exact boundary.
 */
export function isLineInDiff(hunks: Hunk[], side: DiffSide, line: number): boolean {
  return hunks.some((hunk) => {
    const start = side === "deletions" ? hunk.deletionStart : hunk.additionStart;
    const count = side === "deletions" ? hunk.deletionCount : hunk.additionCount;
    return count > 0 && line >= start && line < start + count;
  });
}

/**
 * Nature of the line in the patch: added, deleted, or unchanged
 * (context). `null` if it is not there at all.
 *
 * Serves as the header of an annotation, and it is not decorative: in unified view,
 * an MODIFIED line produces two lines with the same number — the deleted
 * then added it - therefore two neighboring annotations that only this word separates.
 */
export function lineKind(
  hunks: Hunk[],
  side: DiffSide,
  line: number,
): "added" | "removed" | "context" | null {
  for (const hunk of hunks) {
    const start = side === "deletions" ? hunk.deletionStart : hunk.additionStart;
    const count = side === "deletions" ? hunk.deletionCount : hunk.additionCount;
    if (count === 0 || line < start || line >= start + count) continue;
    let current = start;
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        if (line < current + content.lines) return "context";
        current += content.lines;
        continue;
      }
      const changed = side === "deletions" ? content.deletions : content.additions;
      if (line < current + changed) return side === "deletions" ? "removed" : "added";
      current += changed;
    }
    return null;
  }
  return null;
}

/**
 * Anchor to send for a gutter selection, or `null` if it comes out of the
 * diff — in which case we do not open compose rather than offering a send
 * dedicated to 422.
 *
 * The selection arrives in the order of the GESTURE: sliding up gives
 * `start > end`. GitHub wants the range in FILE order.
 *
 * A range that changes sides en route (from the deletions column to that
 * additions, side-by-side) does not describe anything that the forge knows how to anchor: it is
 * then returns to its finish line. `multiLine` does the same wherever the
 * ranges are not supported (GitLab).
 */
export function commentAnchor(
  hunks: Hunk[],
  range: SelectedLineRange,
  { multiLine }: { multiLine: boolean },
): CommentAnchor | null {
  const endSide: DiffSide = range.endSide ?? range.side ?? "additions";
  const startSide: DiffSide = range.side ?? endSide;

  const single = (): CommentAnchor | null =>
    isLineInDiff(hunks, endSide, range.end) ? { side: endSide, line: range.end } : null;

  if (!multiLine || startSide !== endSide || range.start === range.end) return single();

  const line = Math.max(range.start, range.end);
  const startLine = Math.min(range.start, range.end);
  // We only control the two ENDS. A beach can therefore span a gap
  // hidden (two separate hunks) — this case has NOT been proven against the API:
  // if the forge refuses it, it responds 422 and the UI already says it (`lineNotInDiff`),
  // text kept. Checking intermediate lines would require listing them
  // for a case that we do not yet know to be at fault.
  if (!isLineInDiff(hunks, endSide, line) || !isLineInDiff(hunks, startSide, startLine)) {
    return single();
  }
  return { side: endSide, line, startLine, startSide };
}

/**
 * First line common to all wires anchored on the same line, or `null`.
 *
 * Serves as the title of an annotation, which is UNIQUE where the threads can be
 * several: if two of them cover different ranges, no sentence
 * does not say them both, and we then fall back on the anchor line — the only
 * statement which remains true in all cases.
 */
export function sharedStartLine(threads: PrReviewThread[]): number | null {
  const first = threads[0]?.root.start_line ?? null;
  if (first == null) return null;
  return threads.every((thread) => thread.root.start_line === first) ? first : null;
}
