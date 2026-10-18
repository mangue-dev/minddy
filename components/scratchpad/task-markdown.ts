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

/** State for a leading `[m]` marker, with an optional following space. */
function markerState(content: string): PlanTaskState | null {
  const marker = content.slice(0, 3);
  if (content.length > 3 && content[3] !== " ") return null;
  return STATE_BY_MARKER[marker] ?? null;
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
  markup?: string;
}
interface MdTokenConstructor {
  new (type: string, tag: string, nesting: number): MdToken & {
    markup: string;
    block: boolean;
    map: [number, number] | null;
  };
}
interface MdState {
  tokens: MdToken[];
  Token: MdTokenConstructor;
}
interface MarkdownIt {
  core: {
    ruler: {
      after(after: string, name: string, fn: (state: MdState) => void): void;
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
    splitMixedLists(state);
  });
}

const isTaskItem = (token: MdToken) =>
  token.attrs?.some(([name, value]) => name === "data-type" && value === "taskItem") ?? false;

/**
 * A bullet list whose items are partly tasks — a task followed by plain
 * bullets, as plans write sub-steps — is split into consecutive runs of the
 * same kind. Marked whole as a task list, its plain items would not fit the
 * schema, and the parser opened an empty task for them (MIN-728). Adjacent
 * runs serialize as one Markdown list again, so the split is stable.
 */
function splitMixedLists(state: MdState): void {
  const { tokens } = state;
  for (let open = tokens.length - 1; open >= 0; open--) {
    if (tokens[open].type !== "bullet_list_open") continue;
    const level = tokens[open].level;
    const items: number[] = [];
    for (let i = open + 1; i < tokens.length; i++) {
      if (tokens[i].type === "bullet_list_close" && tokens[i].level === level) break;
      if (tokens[i].type === "list_item_open" && tokens[i].level === level + 1) items.push(i);
    }
    if (items.length < 2) continue;
    const kinds = items.map((index) => isTaskItem(tokens[index]));
    if (kinds.every((kind) => kind === kinds[0])) continue;
    for (let k = items.length - 1; k > 0; k--) {
      if (kinds[k] === kinds[k - 1]) continue;
      const close = new state.Token("bullet_list_close", "ul", -1);
      close.level = level;
      close.markup = tokens[open].markup ?? "-";
      close.block = true;
      const reopen = new state.Token("bullet_list_open", "ul", 1);
      reopen.level = level;
      reopen.markup = close.markup;
      reopen.block = true;
      if (kinds[k]) reopen.attrPush(["data-type", "taskList"]);
      tokens.splice(items[k], 0, close, reopen);
    }
    const first = tokens[open];
    if (!kinds[0] && first.attrs) {
      first.attrs = first.attrs.filter(([name]) => name !== "data-type");
    }
  }
}
