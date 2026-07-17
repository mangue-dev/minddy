// Scratchpad (Notes) — pure, server-safe helpers (no React, no I/O).
//
// The scratchpad is ONE personal markdown note. Its content reuses the plan
// format (lib/plan.ts): '##' section titles + checkbox tasks. Here we only add
// what the plan module doesn't cover: a hard size cap, and splitting the note
// into sections so each can be copied to an agent on its own.

/** Hard cap on the stored scratchpad markdown (aligned with plans). */
export const MAX_SCRATCHPAD_LENGTH = 65_536;

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
