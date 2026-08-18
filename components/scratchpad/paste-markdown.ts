import { Extension, type Editor } from "@tiptap/core";
import { DOMParser as PMDOMParser, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { containsMarkdownTaskLine } from "@/lib/scratchpad";

/**
 * Pasting a markdown task list into the notebook gives TASKS — even
 * when the clipboard also has an HTML version.
 *
 * tiptap-markdown only rereads text pasted as markdown by
 * `clipboardTextParser`, and ProseMirror ONLY consults this parser if the
 * clipboard has nothing but text:
 *
 * asText = !!text && (plainText || inCode || !html) // parseFromClipboard
 *
 * But almost any rich source — an editor, a web page, a chat that renders the
 * markdown — also drops a `text/html`, and it is he who wins. The `- [ ]` y
 * are already rendered (in simple bullet points, when the source does not know the lists
 * of tasks), and the notebook contains these bullet points as they are: the check boxes
 * are lost along the way, without anything indicating this.
 *
 * We therefore regain control when the RAW TEXT carries task markers: the
 * clipboard is then markdown, whatever its HTML says, and we reread it
 * by the same path that tiptap-markdown uses for a collage without HTML
 * (same parser, same `parseSlice`) — the note is a markdown document, and its
 * tasks are its raw material.
 *
 * Outside of this case, nothing changes: pasting a web page remains a rich collage.
 */

/** The `<body>` envelope is that of tiptap-markdown: without it, the
 * browser parser moves the head nodes and eats the edge blanks. */
function elementFromString(value: string): HTMLElement {
  return new window.DOMParser().parseFromString(`<body>${value}</body>`, "text/html")
    .body;
}

/** tiptap-markdown adds its parser to storage without increasing TipTap types. */
interface MarkdownStorage {
  markdown: {
    parser: { parse(content: string, options?: { inline?: boolean }): string };
  };
}

/** Is the cursor IN a list item (task or bullet)? */
function inListItem(editor: Editor): boolean {
  const $from = editor.state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "taskItem" || name === "listItem") return true;
  }
  return false;
}

/**
 * Reads `text` in markdown and inserts it into the selection. Returns `false` — without anything
 * touch — when this text does not carry a task, or when it gives nothing.
 *
 * **What decides the shape of the paste is where the cursor is**, and that is
 * all the difference between an imported subtask and a lost subtask:
 *
 * - IN a list, the slice remains "open": its first task merges
 * into the one we are currently writing (or replaces the empty task where we
 * just pressed Enter), and the rest clings to the list in place.
 * - ELSEWHERE — in a paragraph of prose, on an empty line, in a title —
 * this opening FLATTENED the tree: the first task merged with the
 * paragraph, and its subtasks, having lost the parent which carried them,
 * went back to the first level. The list therefore arrives in BLOCK
 * (`openStart`/`openEnd` to 0), entire, with its levels.
 */
export function pasteScratchpadMarkdown(editor: Editor, text: string): boolean {
  if (!containsMarkdownTaskLine(text)) return false;
  const parser = (editor.storage as unknown as MarkdownStorage).markdown?.parser;
  if (!parser) return false;

  const view = editor.view;
  const asBlock = !inListItem(editor);
  const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(
    elementFromString(
      asBlock ? parser.parse(text) : parser.parse(text, { inline: true })
    ),
    asBlock
      ? { preserveWhitespace: true }
      : { preserveWhitespace: true, context: view.state.selection.$from }
  );
  if (slice.content.size === 0) return false;

  view.dispatch(
    view.state.tr
      .replaceSelection(asBlock ? new Slice(slice.content, 0, 0) : slice)
      .scrollIntoView()
      .setMeta("paste", true)
      .setMeta("uiEvent", "paste")
  );
  return true;
}

export const PasteMarkdownTasks = Extension.create({
  name: "pasteMarkdownTasks",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("pasteMarkdownTasks"),
        props: {
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data) return false;
            const text = data.getData("text/plain");
            // Without concurrent HTML, tiptap-markdown has already done the job.
            if (!text || !data.getData("text/html")) return false;
            return pasteScratchpadMarkdown(editor, text);
          },
        },
      }),
    ];
  },
});
