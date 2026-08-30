// Scratchpad (Notes) — pure, server-safe helpers (no React, no I/O).
//
// The scratchpad is ONE personal markdown note. Its content reuses the plan
// format (lib/plan.ts): '##' section titles + checkbox tasks. Here we only add
// what the plan module doesn't cover: a hard size cap, splitting the note into
// sections, and appending new tasks (used by the WYSIWYG editor and the MCP).

import { diff3Merge } from "node-diff3";
import {
  diffPlanTasks,
  parsePlan,
  type PlanTask,
  type PlanTaskState,
} from "@/lib/plan";

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

/** A markdown task line: a bullet (`-`, `*`, `+`) then one of the four
 * markers in the notebook. The `m` causes `^`/`$` to be carried on each line. */
const MARKDOWN_TASK_LINE = /^[ \t]*[-*+][ \t]+\[[ xX~-]\](?=[ \t]|$)/m;
const MARKDOWN_BLOCK = /(?:^|\n)[ \t]{0,3}(?:#{1,6}(?:[ \t]+|$)|[-*+][ \t]+|\d{1,9}[.)][ \t]+|>[ \t]?|`{3,}|~{3,}|(?:-{3,}|\*{3,}|_{3,})[ \t]*$)/m;
const MARKDOWN_INLINE = /(?:`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^\s)\n]+(?:\s+['"][^'"\n]+['"])?\))/;

/** Whether the text contains at least one Markdown task line. */
export function containsMarkdownTaskLine(text: string): boolean {
  return MARKDOWN_TASK_LINE.test(text);
}

/** Whether the text contains a block-level Markdown construct. */
export function containsScratchpadMarkdownBlock(text: string): boolean {
  return MARKDOWN_BLOCK.test(text);
}

/**
 * Whether a rich clipboard's plain-text representation is deliberately
 * Markdown. This lets the notebook prefer that source over companion HTML
 * while preserving ordinary rich-text pastes.
 */
export function containsScratchpadMarkdown(text: string): boolean {
  return (
    containsScratchpadMarkdownBlock(text) || MARKDOWN_INLINE.test(text)
  );
}

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

/**
 * The `headingIndex`th section heading in the notebook (0-based, in document
 * order; a `#` in a code block is not a heading and does not count) —
 * INCLUDING SUBSECTIONS: from the heading to the next heading at the same or
 * a higher level, or to the end of the note.
 *
 * `splitScratchpadSections` splits at EVERY heading: that is what is needed to
 * group tasks by heading (the home preview, the MCP's list of known sections),
 * but not for actions that operate on “this section” — copying it as a prompt
 * or launching an agent. A `# Pull requests` with only `## …` headings below
 * it would otherwise come out empty, leaving the action with nothing to do.
 * Here the section is a SUBTREE, as in `removeSettledTasks`.
 *
 * Returns null when the notebook has fewer headings.
 */
export function scratchpadSectionSubtree(
  content: string,
  headingIndex: number
): ScratchpadSection | null {
  const lines = content.split("\n");
  let fence: string | null = null;
  let seen = -1;
  let start = -1;
  let rank = 0;

  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(FENCE);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length
      )
        fence = null;
      continue;
    }
    if (fence) continue;

    const heading = lines[i].match(HEADING_LEVEL);
    if (!heading) continue;
    if (start === -1) {
      seen += 1;
      if (seen === headingIndex) {
        start = i;
        rank = heading[1].length;
      }
      continue;
    }
    // A deeper heading belongs to the section; a heading at the same or a
    // higher level closes it.
    if (heading[1].length <= rank) return sectionSlice(lines, start, i);
  }

  return start === -1 ? null : sectionSlice(lines, start, lines.length);
}

function sectionSlice(
  lines: string[],
  start: number,
  end: number
): ScratchpadSection {
  const headingMatch = lines[start]?.match(HEADING);
  return {
    title: headingMatch ? headingMatch[1].trim() : null,
    markdown: lines.slice(start, end).join("\n").replace(/\s+$/, ""),
    startLine: start,
  };
}

export interface ScratchpadPreviewSection {
  /** Section title, or null for the content before the first heading. */
  title: string | null;
  /** Its remaining tasks, in notebook order. */
  tasks: PlanTask[];
}

/**
 * What REMAINS to do in the note, grouped by section — enough for a short
 * preview without opening it. Unused since the home screen was reduced to the
 * greeting and composer; retained (and covered) for the next surface that wants
 * to summarize the notebook.
 *
 * “Remaining” means neither completed, cancelled, nor a question: under a
 * `## Questions` heading, a checked box answers a question rather than
 * delivering work, and `parsePlan` marks it accordingly (lib/plan.ts). Sections
 * emptied of tasks are dropped: a heading on its own tells the reader nothing.
 *
 * The note is parsed ONCE, in full, and tasks are then assigned to their
 * section by line number — rather than parsing each section independently.
 * This keeps the preview count equal to the header badge (`planProgress`): a
 * `## Questions` section extends through its subsections, whereas parsing an
 * isolated `### Detail` would count its questions as work again.
 */
export function scratchpadPreview(content: string): ScratchpadPreviewSection[] {
  const left = parsePlan(content).tasks.filter(
    (task) =>
      !task.question && (task.state === "pending" || task.state === "in_progress")
  );
  if (left.length === 0) return [];

  const sections = splitScratchpadSections(content);
  return sections
    .map((section, i) => {
      const end = sections[i + 1]?.startLine ?? Number.POSITIVE_INFINITY;
      return {
        title: section.title,
        tasks: left.filter(
          (task) => task.line >= section.startLine && task.line < end
        ),
      };
    })
    .filter((section) => section.tasks.length > 0);
}

/**
 * Normalize ONE line of task text coming from a model (the dictation step of
 * the notebook, /api/me/scratchpad/dictate-task). The notebook draws the
 * checkbox itself, so a marker, a bullet or a heading level the model wrote
 * anyway is stripped rather than left to show up as literal text; newlines are
 * flattened, since an entry is one line. `max` caps the result.
 */
export function cleanDictatedTaskLine(value: string, max = 1000): string {
  return value
    .replace(/^\s*(?:[-*+]\s*)?(?:\[[ x~-]\]\s*)?/i, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export interface NewTask {
  text: string;
  state: PlanTaskState;
  /** Nesting depth (0 = top level). See TASK_INDENT. */
  depth?: number;
}

/**
 * What separates one nesting level from the next in the notebook markdown:
 * TWO spaces, the unit read by `parsePlan` (`indentDepth`) and produced by the
 * editor (`renderList` from prosemirror-markdown; see task-nodes.ts). A
 * subtask written with a different step is read back at the wrong depth.
 */
export const TASK_INDENT = "  ";

/** A task line as written in the notebook. */
export interface ScratchpadTaskLine {
  /** 0 = top level. See TASK_INDENT. */
  depth: number;
  state: PlanTaskState;
  text: string;
}

/**
 * Markdown for a task-tree fragment — the shared building block for every
 * action that TAKES a task OUT of the notebook (copying it as a prompt,
 * launching an agent, promoting it to a ticket) and for actions that ADD one.
 * Depths are written as-is; the caller must normalize them to 0 when needed
 * (`taskSubtreeLines` does this).
 */
export function taskLinesMarkdown(lines: ScratchpadTaskLine[]): string {
  return lines
    .map(
      (line) =>
        `${TASK_INDENT.repeat(Math.max(0, Math.trunc(line.depth) || 0))}- ${
          TASK_MARKER_BY_STATE[line.state]
        } ${line.text.replace(/\s*\r?\n\s*/g, " ").trim()}`
    )
    .join("\n");
}

/**
 * The task at `index` AND everything it contains by depth: its subtasks and
 * theirs, with no limit on nesting. Plan tasks are in document order, so the
 * subtree is the slice after the root while the depth remains STRICTLY greater
 * than the root's.
 *
 * Returns an empty array when the index does not identify a task.
 */
export function taskSubtree(tasks: PlanTask[], index: number): PlanTask[] {
  const at = tasks.findIndex((task) => task.index === index);
  if (at === -1) return [];
  const out = [tasks[at]];
  for (let i = at + 1; i < tasks.length; i++) {
    if (tasks[i].depth <= tasks[at].depth) break;
    out.push(tasks[i]);
  }
  return out;
}

/**
 * The subtree of task `index`, ready to LEAVE the notebook.
 *
 * The hierarchy rule: **a parent carries its children; a child does not carry
 * its parent.** The higher the action starts in the tree, the more it carries;
 * it never moves upward. That is why depths are renormalized at the root: a
 * subtask copied on its own starts flat, like a task by itself, without dragging
 * along the indentation from its original location — which means nothing
 * outside its parent (and is read as a code block from four spaces onward).
 *
 * `map` allows tasks to leave in their state AFTER the action (a handoff starts
 * the work, including the root and its descendants).
 */
export function taskSubtreeLines(
  tasks: PlanTask[],
  index: number,
  map?: (state: PlanTaskState) => PlanTaskState
): ScratchpadTaskLine[] {
  const subtree = taskSubtree(tasks, index);
  if (subtree.length === 0) return [];
  const base = subtree[0].depth;
  return subtree.map((task) => ({
    depth: Math.max(0, task.depth - base),
    state: map ? map(task.state) : task.state,
    text: task.text,
  }));
}

/**
 * Append task lines to the note. With `section`, they go at the END of the
 * matching '##' section (before the next heading); returns `null` when that
 * section doesn't exist so the caller can report it. Without `section`, they go
 * at the end of the document. Task text is flattened to a single line.
 *
 * `depth` nests the task under the preceding one (0 = top level) — the only way
 * to ADD a subtask without rewriting the entire notebook.
 */
export function appendScratchpadTasks(
  content: string,
  tasks: NewTask[],
  section?: string | null
): string | null {
  const block = taskLinesMarkdown(
    tasks.map((task) => ({
      // Do not normalize here: these are the depths requested by the caller,
      // and a first task at `depth: 1` remains a subtask of what ALREADY
      // precedes it in the notebook.
      depth: Math.max(0, Math.trunc(task.depth ?? 0)),
      state: task.state,
      text: task.text,
    }))
  ).split("\n");
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
    // Put additions before the section's trailing spacing, but keep that spacing
    // byte-for-byte. The same helper serves the MCP and Numo, and deleting these
    // lines here made a remote task addition collapse the empty paragraphs the
    // user deliberately kept between sections.
    let end = insertAt;
    while (end > headingIdx + 1 && lines[end - 1].trim() === "") end--;
    return [...lines.slice(0, end), ...block, ...lines.slice(end)].join("\n");
  }

  if (content === "") return block.join("\n") + "\n";

  // Keep trailing empty paragraphs (including the non-breaking-space sentinel
  // produced by the WYSIWYG editor) after the newly appended tasks. Moving the
  // insertion point rather than trimming preserves every existing line while
  // still appending tasks directly after the last substantive note content.
  const onlySpacing = lines.every((line) => line.trim() === "");
  if (onlySpacing) {
    const separator = content.endsWith("\n") ? "" : "\n";
    return `${content}${separator}${block.join("\n")}\n`;
  }
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  const next = [...lines.slice(0, end), ...block, ...lines.slice(end)].join("\n");
  return next.endsWith("\n") ? next : `${next}\n`;
}

/**
 * Drop every SETTLED task line — completed ('- [x]') and cancelled ('- [-]'),
 * the two ways to finish a task — AND collapse any heading section that
 * clearing those tasks leaves empty, so emptying a section removes its heading
 * instead of leaving an orphaned subheading.
 *
 * THE SAME RULE APPLIES TO SUBTASKS, one level down: a checked task that still
 * carries work REMAINS. Removing it would leave its subtasks suspended in
 * empty space — indented under nothing, so they would be read at the level
 * above, or worse, as a code block from four spaces onward. A task therefore
 * leaves only when its ENTIRE subtree is settled, and it leaves with that
 * subtree. This is the hierarchy rule from the other direction: a parent
 * carries its children, including when they are being deleted.
 *
 * A heading is dropped whole (heading + its emptied sub-headings + their blank
 * lines and '---' separators) only when its ENTIRE subtree — down to the next
 * heading of the same or a shallower level — has nothing left worth keeping: no
 * surviving task (pending or in progress), no prose, no code. So a parent with
 * a still-live subsection stays, an emptied subsection goes, and a section with
 * notes under it keeps its title. Fence-aware (a '#' inside a code block is not
 * a heading). `removed` counts the settled TASKS actually dropped (0 → content
 * unchanged).
 */
export function removeSettledTasks(content: string): {
  content: string;
  removed: number;
} {
  const parsed = parsePlan(content);
  const settled = (task: PlanTask) =>
    task.state === "completed" || task.state === "cancelled";
  const settledLines = new Set<number>();
  for (let i = 0; i < parsed.tasks.length; i++) {
    const task = parsed.tasks[i];
    if (!settled(task)) continue;
    // The entire subtree must be settled, otherwise the task remains because it
    // still carries its children's work.
    let clear = true;
    for (
      let j = i + 1;
      j < parsed.tasks.length && parsed.tasks[j].depth > task.depth;
      j++
    ) {
      if (!settled(parsed.tasks[j])) {
        clear = false;
        break;
      }
    }
    if (clear) settledLines.add(task.line);
  }
  if (settledLines.size === 0) return { content, removed: 0 };

  const lines = content.split("\n");
  const taskLines = new Set(parsed.tasks.map((task) => task.line));
  const toRemove = new Set<number>(settledLines);

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
    if (taskLines.has(i)) survives[i] = !settledLines.has(i);
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
  return { content: kept.join("\n"), removed: settledLines.size };
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
