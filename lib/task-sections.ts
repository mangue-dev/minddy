// Where a task lives IN its document — the “document” half of what
// lib/scratchpad-prompt.ts then done with strings.
//
// Separate from the view (components/scratchpad/task-item-view.tsx) for the same
// reason that the schema was from its view: the view draws `mangue-ui` and does not
// only displays in a browser, whereas this only speaks to ProseMirror and
// therefore plays on a real document, in a test. It is the channel through which a
// task arrives at the agent with his section — if he makes a mistake, no one will
// see: the prompt still goes, it just says something else.

import type { Editor } from "@tiptap/core";
import { sectionHeadingChain } from "@/lib/scratchpad-prompt";

/**
 * Markdown title lines (including levels) of sections that CONTAIN the
 * block located in `pos`, from widest to narrowest — empty if task
 * trails before any title. Repeated as is at the top of the copied markdown /
 * launched: this is what allows the prompt to name the section.
 *
 * Hierarchy matters: a task under “## Sidebar” is also a task under
 * “# Pull requests”, and the closest title is not enough to locate it. The
 * nesting rule lives in `sectionHeadingChain` — here we only do it
 * list the titles which precede the task.
 *
 * We reason at the FIRST LEVEL of the document: the task lives in a `taskList`,
 * we go back to its first level block, then we note the titles which precede
 *, in the order of the document. A title enclosed in a leaflet therefore does not count as a section — it is folded content, not an outline.
 */
export function taskSectionHeadings(
  editor: Editor,
  pos: number | undefined
): string[] {
  if (pos == null) return [];
  const doc = editor.state.doc;
  if (pos < 0 || pos > doc.content.size) return [];
  const before: Array<{ level: number; text: string }> = [];
  const index = doc.resolve(pos).index(0);
  for (let i = 0; i < index; i++) {
    const child = doc.child(i);
    if (child.type.name !== "heading") continue;
    before.push({
      level: Number(child.attrs.level) || 2,
      text: child.textContent,
    });
  }
  return sectionHeadingChain(before);
}
