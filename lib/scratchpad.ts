// Scratchpad (Notes) — pure, server-safe helpers (no React, no I/O).
//
// The scratchpad is ONE personal markdown note. Its content reuses the plan
// format (lib/plan.ts): '##' section titles + checkbox tasks. Here we only add
// what the plan module doesn't cover: a hard size cap, splitting the note into
// sections, and appending new tasks (used by the WYSIWYG editor and the MCP).

import { diff3Merge } from "node-diff3";
import { diffPlanTasks, parsePlan, type PlanTaskState } from "@/lib/plan";

/** Hard cap on the stored scratchpad markdown (aligned with plans). */
export const MAX_SCRATCHPAD_LENGTH = 65_536;

/**
 * Three-way LINE merge for concurrent scratchpad edits — your open editor vs the
 * agent via the MCP writing against a stale version. Combines both sides'
 * changes against the common ancestor `base`:
 *
 *   - edits on DIFFERENT lines from each side are both kept;
 *   - when the SAME region was changed on both sides (a true conflict), YOUR
 *     version (`ours`) wins — the user's work is never silently dropped.
 *
 * Line-oriented (the note is markdown tasks/sections) via node-diff3. Pure and
 * server-safe, shared by the client save path and any server-side reconcile.
 */
export function mergeScratchpad(
  base: string,
  ours: string,
  theirs: string
): string {
  if (ours === theirs) return ours;
  if (base === theirs) return ours; // only you changed
  if (base === ours) return theirs; // only the other side changed
  const regions = diff3Merge(
    ours.split("\n"),
    base.split("\n"),
    theirs.split("\n"),
    { excludeFalseConflicts: true }
  );
  const out: string[] = [];
  for (const region of regions) {
    // `ok` = a stretch both sides agree on (incl. one-sided changes); on a real
    // conflict keep `a` (ours) so your version wins.
    if (region.ok) out.push(...region.ok);
    else if (region.conflict) out.push(...region.conflict.a);
  }
  return out.join("\n");
}

/** Full checkbox marker (with brackets) for each task state. */
export const TASK_MARKER_BY_STATE: Record<PlanTaskState, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
  cancelled: "[-]",
};

/** How a deliberate empty line (spacer) is stored. Markdown collapses runs of
 *  blank lines, so an empty paragraph the user typed for spacing would vanish on
 *  the WYSIWYG round-trip. A lone non-breaking space renders blank but is NOT a
 *  Markdown blank line, so consecutive spacers survive close/reopen. The editor
 *  (scratchpad-paragraph.ts) writes this on serialize and re-empties it on parse. */
export const SPACER_LINE = "\u00A0";

/** A line that is only a spacer (nbsp + optional spaces/tabs). Matched WITHOUT
 *  String.trim(), which itself strips U+00A0 and would hide the sentinel. */
const SPACER_LINE_RE = /^[ \t]*\u00A0[ \t\u00A0]*$/;

/**
 * Drop the invisible spacer lines (see SPACER_LINE) and collapse the blank runs
 * they leave behind. Used on every "copy as prompt" / export path so the on-screen
 * spacing never leaks non-breaking spaces into an agent prompt.
 */
export function stripScratchpadSpacers(content: string): string {
  return content
    .split("\n")
    .filter((line) => !SPACER_LINE_RE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export interface ScratchpadSection {
  /** Heading text with markers stripped, or null for the preamble before any
      heading. */
  title: string | null;
  /** Raw markdown of the section, INCLUDING its heading line. */
  markdown: string;
  /** 0-based index of the section's first line in the full document — added to
      a section-relative task line to address the task in the whole note. */
  startLine: number;
}

const HEADING = /^ {0,3}#{1,6}\s+(.*)$/;
const HEADING_LEVEL = /^ {0,3}(#{1,6})\s+/;
const THEMATIC_BREAK = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Split the note into sections at top-of-line markdown headings (`#`…`######`),
 * ignoring headings inside fenced code blocks. Content before the first heading
 * is a section with `title: null`. Blank sections are dropped. `startLine` is
 * preserved on absolute line numbers so callers can map a section-relative task
 * back to the whole document.
 */
export function splitScratchpadSections(content: string): ScratchpadSection[] {
  const lines = content.split("\n");
  const sections: ScratchpadSection[] = [];
  let start = 0;
  let fence: string | null = null;

  const push = (end: number) => {
    const markdown = lines.slice(start, end).join("\n");
    const headingMatch = lines[start]?.match(HEADING);
    sections.push({
      title: headingMatch ? headingMatch[1].trim() : null,
      markdown,
      startLine: start,
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length)
        fence = null;
    }
    if (!fence && HEADING.test(line) && i > start) {
      push(i);
      start = i;
    }
  }
  push(lines.length);

  return sections.filter((s) => s.markdown.trim() !== "");
}

export interface NewTask {
  text: string;
  state: PlanTaskState;
}

/**
 * Append task lines to the note. With `section`, they go at the END of the
 * matching '##' section (before the next heading); returns `null` when that
 * section doesn't exist so the caller can report it. Without `section`, they go
 * at the end of the document. Task text is flattened to a single line.
 */
export function appendScratchpadTasks(
  content: string,
  tasks: NewTask[],
  section?: string | null
): string | null {
  const block = tasks.map(
    (task) =>
      `- ${TASK_MARKER_BY_STATE[task.state]} ${task.text.replace(/\s*\r?\n\s*/g, " ").trim()}`
  );
  const lines = content.split("\n");

  if (section && section.trim()) {
    const wanted = section.trim().toLowerCase();
    let fence: string | null = null;
    let headingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const fm = lines[i].match(FENCE);
      if (fm) {
        if (!fence) fence = fm[1];
        else if (fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      }
      if (fence) continue;
      const hm = lines[i].match(HEADING);
      if (hm && hm[1].trim().toLowerCase() === wanted) {
        headingIdx = i;
        break;
      }
    }
    if (headingIdx === -1) return null;

    // Insert before the next heading after this one (fence-aware), else at EOF.
    let insertAt = lines.length;
    fence = null;
    for (let i = headingIdx + 1; i < lines.length; i++) {
      const fm = lines[i].match(FENCE);
      if (fm) {
        if (!fence) fence = fm[1];
        else if (fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      }
      if (fence) continue;
      if (HEADING.test(lines[i])) {
        insertAt = i;
        break;
      }
    }
    // Drop the section's trailing blank lines so the block sits tight under it.
    let end = insertAt;
    while (end > headingIdx + 1 && lines[end - 1].trim() === "") end--;
    return [...lines.slice(0, end), ...block, ...lines.slice(end)].join("\n");
  }

  if (!content.trim()) return block.join("\n") + "\n";
  return content.replace(/\n+$/, "") + "\n" + block.join("\n") + "\n";
}

/**
 * Drop every completed ('- [x]') task line, AND collapse any heading section
 * that clearing those tasks leaves empty — so completing every task under a
 * title removes the title too, instead of stranding a bare heading.
 *
 * A heading is dropped whole (heading + its emptied sub-headings + their blank
 * lines and '---' separators) only when its ENTIRE subtree — down to the next
 * heading of the same or a shallower level — has nothing left worth keeping: no
 * surviving task (incomplete or cancelled), no prose, no code. So a parent with
 * a still-live subsection stays, an emptied subsection goes, and a section with
 * notes under it keeps its title. Fence-aware (a '#' inside a code block is not
 * a heading). `removed` counts the completed TASKS (0 → content unchanged).
 */
export function removeCompletedTasks(content: string): {
  content: string;
  removed: number;
} {
  const parsed = parsePlan(content);
  const completedLines = new Set(
    parsed.tasks
      .filter((task) => task.state === "completed")
      .map((task) => task.line)
  );
  if (completedLines.size === 0) return { content, removed: 0 };

  const lines = content.split("\n");
  const taskLines = new Set(parsed.tasks.map((task) => task.line));
  const toRemove = new Set<number>(completedLines);

  // Classify each line: is it a heading (and at what level), and does it "keep
  // a section alive" (a surviving task, prose, or code — not a heading, blank,
  // spacer or '---').
  const isHeading: boolean[] = [];
  const level: number[] = [];
  const survives: boolean[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(FENCE);
    if (fm) {
      if (!fence) fence = fm[1];
      else if (fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      isHeading[i] = false;
      level[i] = 0;
      survives[i] = true; // a fence line is real content
      continue;
    }
    if (fence) {
      isHeading[i] = false;
      level[i] = 0;
      survives[i] = true; // inside a code block
      continue;
    }
    const hm = line.match(HEADING_LEVEL);
    if (hm) {
      isHeading[i] = true;
      level[i] = hm[1].length;
      survives[i] = false; // a heading alone keeps nothing alive
      continue;
    }
    isHeading[i] = false;
    level[i] = 0;
    if (taskLines.has(i)) survives[i] = !completedLines.has(i);
    else survives[i] = line.trim() !== "" && !THEMATIC_BREAK.test(line);
  }

  for (let i = 0; i < lines.length; i++) {
    if (!isHeading[i]) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (isHeading[j] && level[j] <= level[i]) {
        end = j;
        break;
      }
    }
    let hasSurvivor = false;
    for (let j = i; j < end; j++) {
      if (survives[j]) {
        hasSurvivor = true;
        break;
      }
    }
    if (!hasSurvivor) for (let j = i; j < end; j++) toRemove.add(j);
  }

  const kept = lines.filter((_, i) => !toRemove.has(i));
  return { content: kept.join("\n"), removed: completedLines.size };
}

/**
 * Labels of the tasks that went from unchecked to CHECKED between two versions
 * of the note — what the stats ledger records (lib/server/scratchpad.ts).
 *
 * The note keeps no history and is deliberately volatile: tasks are added,
 * ticked, then cleared away. So a tick is only ever visible in the transition
 * between two versions, and it has to be told apart from the churn around it:
 *   - a task added ALREADY checked (a pasted list, an agent writing '- [x]')
 *     is not a tick — nobody completed anything;
 *   - deleting a checked task is not an un-tick, and re-adding it later is not
 *     a second one;
 *   - moving a task across sections leaves its state alone.
 * Pairing is by label (the plan module's rule), so renaming a task while
 * ticking it reads as a delete + an already-checked add, and is not counted.
 */
export function tasksCheckedOff(
  before: string | null | undefined,
  after: string | null | undefined
): string[] {
  return diffPlanTasks(before, after)
    .filter((t) => t.to === "completed")
    .map((t) => t.text);
}
