// Scratchpad (Notes) — pure, server-safe helpers (no React, no I/O).
//
// The scratchpad is ONE personal markdown note. Its content reuses the plan
// format (lib/plan.ts): '##' section titles + checkbox tasks. Here we only add
// what the plan module doesn't cover: a hard size cap, splitting the note into
// sections, and appending new tasks (used by the WYSIWYG editor and the MCP).

import { parsePlan, type PlanTaskState } from "@/lib/plan";

/** Hard cap on the stored scratchpad markdown (aligned with plans). */
export const MAX_SCRATCHPAD_LENGTH = 65_536;

/** Full checkbox marker (with brackets) for each task state. */
export const TASK_MARKER_BY_STATE: Record<PlanTaskState, string> = {
  pending: "[ ]",
  in_progress: "[~]",
  completed: "[x]",
  cancelled: "[-]",
};

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

/** Drop every completed ('- [x]') task line. Returns the new content and how
    many were removed (0 → content is returned unchanged). */
export function removeCompletedTasks(content: string): {
  content: string;
  removed: number;
} {
  const doneLines = new Set(
    parsePlan(content)
      .tasks.filter((task) => task.state === "completed")
      .map((task) => task.line)
  );
  if (doneLines.size === 0) return { content, removed: 0 };
  const kept = content.split("\n").filter((_, i) => !doneLines.has(i));
  return { content: kept.join("\n"), removed: doneLines.size };
}
