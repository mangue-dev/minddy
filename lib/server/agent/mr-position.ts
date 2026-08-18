/**
 * Position resolution in a GitLab unified diff (MIN-69) — module PUR
 * (without `server-only`, testable) used by `mr.ts` to post a review
 * comment: GitLab requires `new_line` alone for an added line, `old_line`
 * alone for a deleted one, and BOTH for a context line — we walk
 * so the hunks to find the counterpart. Null if the line does not belong to
 * in the diff (actually calling it a 422, same contract as GitHub).
 */
export function resolveDiffPosition(
  diff: string,
  line: number,
  side: "LEFT" | "RIGHT",
): { oldLine: number | null; newLine: number | null } | null {
  let oldN = 0;
  let newN = 0;
  let inHunk = false;
  const lines = diff.split("\n");
  // Split leaves a final "" after the last \n — not a context line.
  if (lines[lines.length - 1] === "") lines.pop();
  for (const l of lines) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) {
      oldN = Number(m[1]);
      newN = Number(m[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (l.startsWith("\\")) continue; // « \ No newline at end of file »
    if (l.startsWith("+")) {
      if (side === "RIGHT" && newN === line) return { oldLine: null, newLine: line };
      newN++;
    } else if (l.startsWith("-")) {
      if (side === "LEFT" && oldN === line) return { oldLine: line, newLine: null };
      oldN++;
    } else {
      // Context line (space prefix — or empty, some diffs emit it).
      if (side === "RIGHT" && newN === line) return { oldLine: oldN, newLine: line };
      if (side === "LEFT" && oldN === line) return { oldLine: line, newLine: newN };
      oldN++;
      newN++;
    }
  }
  return null;
}
