// Markdown round-trip for the scratchpad's 4-state tasks. The note's storage is
// the plan format (lib/plan.ts): `- [ ]` pending, `- [~]` in progress, `- [x]`
// completed, `- [-]` cancelled. markdown-it-task-lists (what tiptap-markdown
// ships) only knows `[ ]`/`[x]`, so we fork a tiny markdown-it rule that maps
// all four markers onto a `data-state` on the list item — the WYSIWYG TaskItem
// then reads that attribute. Serialization back to markers lives on the node.

import type { PlanTaskState } from "@/lib/plan";

const STATE_BY_MARKER: Record<string, PlanTaskState> = {
  "[ ]": "pending",
  "[~]": "in_progress",
  "[x]": "completed",
  "[X]": "completed",
  "[-]": "cancelled",
};

/** State for a leading `[m] ` marker (marker + a single space), or null. */
function markerState(content: string): PlanTaskState | null {
  if (content[3] !== " ") return null;
  return STATE_BY_MARKER[content.slice(0, 3)] ?? null;
}

// Minimal shape of the markdown-it pieces we touch — avoids a hard dep on
// markdown-it's types (it's a transitive dep of tiptap-markdown).
interface MdToken {
  type: string;
  content: string;
  level: number;
  children: MdToken[] | null;
  attrIndex(name: string): number;
  attrPush(attr: [string, string]): void;
  attrs: [string, string][] | null;
}
interface MarkdownIt {
  core: {
    ruler: {
      after(
        after: string,
        name: string,
        fn: (state: { tokens: MdToken[] }) => void
      ): void;
    };
  };
}

function attrSet(token: MdToken, name: string, value: string): void {
  const index = token.attrIndex(name);
  if (index < 0) token.attrPush([name, value]);
  else if (token.attrs) token.attrs[index] = [name, value];
}

/** Index of the enclosing list token for the item opened at `index`. */
function parentListIndex(tokens: MdToken[], index: number): number {
  const target = tokens[index].level - 1;
  for (let i = index - 1; i >= 0; i--) {
    if (tokens[i].level === target) return i;
  }
  return -1;
}

/**
 * markdown-it plugin: any list item whose text starts with one of the four task
 * markers becomes `<li data-type="taskItem" data-state="…">` inside
 * `<ul data-type="taskList">`, with the marker stripped from the text.
 */
export function scratchpadTaskMarkdownIt(md: MarkdownIt): void {
  md.core.ruler.after("inline", "scratchpad-tasks", (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const inline = tokens[i];
      if (
        inline.type !== "inline" ||
        tokens[i - 1].type !== "paragraph_open" ||
        tokens[i - 2].type !== "list_item_open"
      ) {
        continue;
      }
      const taskState = markerState(inline.content);
      if (!taskState) continue;

      // Strip the "[m] " marker (4 chars) from the raw content and its first
      // text child (what the renderer emits).
      inline.content = inline.content.slice(4);
      const first = inline.children?.[0];
      if (first && first.type === "text") first.content = first.content.slice(4);

      attrSet(tokens[i - 2], "data-type", "taskItem");
      attrSet(tokens[i - 2], "data-state", taskState);
      const parent = parentListIndex(tokens, i - 2);
      if (parent >= 0) attrSet(tokens[parent], "data-type", "taskList");
    }
  });
}
