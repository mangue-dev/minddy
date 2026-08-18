/**
 * The `diff_hunk` of a review comment, ready to go — the code snippet
 * ON WHICH the comment was posted.
 *
 * Both forges deliver this snippet in plain unified text, header `@@` including
 * and without line numbers. Making it as is results in a monospace tile where nothing says which line is commented out, nor which one is appended. But that's all
 * the point: a line comment without its code is a sentence without a subject.
 *
 * Two readings, and it's `hunkPatch` which serves the rendering: it makes the fragment
 * analyzable by the diff lib, therefore COLORED and in mode diff like tab
 * Files. `hunkPreview` remains the bare reading of the fragment, for those who need the
 * lines rather than a patch.
 *
 * Pure and without dependence, like `pr-review-threads`: the same rule serves the thread of
 * conversation and any other rendering which would need the context.
 */

export interface HunkPreviewLine {
  /** Added, removed, or unchanged context — which decides the color. */
  type: "add" | "del" | "context";
  /** The line WITHOUT its `+`/`-`/space marker. */
  content: string;
  /** Base side number, `null` on an added line. */
  oldLine: number | null;
  /** Head side number, `null` on a removed line. */
  newLine: number | null;
}

/** `@@ -12,7 +12,9 @@` → both starting points. The rest of the line (the name
 of the enclosing function, which GitHub pastes there) is not used for the calculation. */
const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** The analyzed hunk: its numbered lines, and the starting point on both sides. */
interface ParsedHunk {
  lines: HunkPreviewLine[];
  oldStart: number;
  newStart: number;
}

function parseHunk(diffHunk: string): ParsedHunk | null {
  const raw = (diffHunk ?? "").split("\n");
  const start = raw.findIndex((l) => HEADER.test(l));
  if (start < 0) return null;
  const match = raw[start].match(HEADER)!;
  const oldStart = Number(match[1]);
  const newStart = Number(match[2]);
  let oldLine = oldStart;
  let newLine = newStart;

  const lines: HunkPreviewLine[] = [];
  for (const line of raw.slice(start + 1)) {
    // `\ No newline at end of file`: a git annotation, not a line of code.
    if (line.startsWith("\\")) continue;
    if (line.startsWith("+")) {
      lines.push({ type: "add", content: line.slice(1), oldLine: null, newLine: newLine++ });
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", content: line.slice(1), oldLine: oldLine++, newLine: null });
    } else {
      // Context line. The prefix is ​​a space — except on the last line
      // of a hunk, which certain APIs make empty: `slice(1)` leaves it empty,
      // what exactly is its content.
      lines.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
  }
  return { lines, oldStart, newStart };
}

/**
 * The last lines of the hunk, numbered. The END and not the beginning: both
 * forges end the extract on the commented line — that's the one we want to see,
 * with just enough context above to locate it.
 *
 * Empty when there is no hunk (GitLab does not use any): the caller falls
 * then on the anchor `fichier:ligne` alone, which it was already doing.
 */
export function hunkPreview(diffHunk: string, maxLines = 4): HunkPreviewLine[] {
  const parsed = parseHunk(diffHunk);
  if (!parsed) return [];
  return maxLines > 0 ? parsed.lines.slice(-maxLines) : parsed.lines;
}

/**
 * The same extract, but rewritten in complete UNIFIED DIFF — the form that
 * `parsePatchFiles` can analyze, therefore the one which opens the rendering of
 to this extract * the Files tab: Shiki coloring, word-for-word marking, gutter.
 *
 * That's the whole point of the function: the forges' `diff_hunk` is a FRAGMENT
 * (a `@@` and its lines, without a filename), and the diff lib only takes
 * files. We therefore return the file around it — the real path, so that
 * the extension decides the grammar, exactly as `toUnifiedDiff` does
 * for a file of PR.
 *
 * The header is RECALCULATED on the guarded slice, not copied: the numbers de
 * lines displayed come from there, and those of the original hunk would talk about the lines
 * that we just discarded.
 *
 * Empty string when there is nothing to return (no hunk, or an empty hunk):
 * the caller then does not display a snippet.
 */
export function hunkPatch(path: string, diffHunk: string, maxLines = 4): string {
  const parsed = parseHunk(diffHunk);
  if (!parsed) return "";
  const kept = maxLines > 0 ? parsed.lines.slice(-maxLines) : parsed.lines;
  if (kept.length === 0) return "";

  // The cursor at the START of the slice: each line pushed aside moved the
  // side to which it belongs, and only that one.
  let oldStart = parsed.oldStart;
  let newStart = parsed.newStart;
  for (const line of parsed.lines.slice(0, parsed.lines.length - kept.length)) {
    if (line.type !== "add") oldStart++;
    if (line.type !== "del") newStart++;
  }
  const oldCount = kept.filter((l) => l.type !== "add").length;
  const newCount = kept.filter((l) => l.type !== "del").length;

  const body = kept
    .map((l) => (l.type === "add" ? "+" : l.type === "del" ? "-" : " ") + l.content)
    .join("\n");
  // Git convention for an empty side: the number is that of the AFTER line
  // which one is inserted, so a notch below the cursor.
  const oldAt = oldCount === 0 ? Math.max(0, oldStart - 1) : oldStart;
  const newAt = newCount === 0 ? Math.max(0, newStart - 1) : newStart;

  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldAt},${oldCount} +${newAt},${newCount} @@`,
    body,
    "",
  ].join("\n");
}
