// What the command palette can find in the task notebook (MIN-725) — pure, no
// React, no I/O, so the rows it builds are tested on real Markdown.

import type { MentionLinkType } from "@/lib/mention-link";
import { plainMarkdownParts } from "@/lib/plain-markdown";
import { scratchpadPreview } from "@/lib/scratchpad";

/** One notebook task as a palette row. */
export interface ScratchpadSearchTask {
  /** 0-based order among ALL the note's tasks — what the editor uses to land
      on the same task item (see `findTaskItemPos`). */
  index: number;
  /** The task as plain text, typed mentions under their current label. */
  text: string;
  /** Plain title of the section it sits under, or null before any heading. */
  section: string | null;
}

/**
 * The current label of a typed mention, as the reader may see it: a string,
 * `null` when the target is not visible to them, `undefined` when unknown yet.
 */
export type MentionLabelOf = (type: MentionLinkType, id: string) => string | null | undefined;

/**
 * The note's remaining tasks — neither completed, cancelled, nor a question,
 * the same set as the header badge counts — as rows to search, in notebook
 * order. A done task is history, not something to jump back to.
 *
 * A typed mention never prints its stored label (MIN-734): it reads as the
 * target's current label from `labelOf`, the neutral `unavailable` text when
 * the reader cannot see it, and an ellipsis while it is unknown.
 */
export function scratchpadSearchTasks(
  content: string,
  labelOf: MentionLabelOf,
  unavailable: string,
): ScratchpadSearchTask[] {
  const plain = (markdown: string) =>
    plainMarkdownParts(markdown)
      .map((part) => {
        if (typeof part === "string") return part;
        const label = labelOf(part.type, part.id);
        return `@${label === null ? unavailable : label ?? "…"}`;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  return scratchpadPreview(content).flatMap((section) => {
    const title = section.title === null ? null : plain(section.title) || null;
    return section.tasks.flatMap((task) => {
      const text = plain(task.text);
      return text ? [{ index: task.index, text, section: title }] : [];
    });
  });
}
