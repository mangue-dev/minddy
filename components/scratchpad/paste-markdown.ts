import { Extension, type Editor } from "@tiptap/core";
import { DOMParser as PMDOMParser, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
  containsScratchpadMarkdown,
  containsScratchpadMarkdownBlock,
} from "@/lib/scratchpad";

/**
 * Pasting Markdown into the notebook creates rendered editor nodes, even when
 * the clipboard also has an HTML representation.
 *
 * tiptap-markdown only re-parses text through `clipboardTextParser` when
 * ProseMirror receives no HTML:
 *
 * asText = !!text && (plainText || inCode || !html) // parseFromClipboard
 *
 * Most rich sources — editors, web pages, and chats that render Markdown —
 * provide `text/html`, which normally wins. That would leave Markdown such as
 * `## Heading` or `**strong text**` raw, and turn task markers into ordinary
 * bullets when the source does not support task lists.
 *
 * When the plain text clearly carries Markdown, the notebook therefore uses it
 * in preference to the companion HTML and parses it through the same path used
 * for a text-only clipboard. Ordinary rich-text pastes are left untouched.
 *
 */

/** Mirrors tiptap-markdown's `<body>` envelope so the browser parser keeps
 * top-level nodes and leading/trailing whitespace intact. */
function elementFromString(value: string): HTMLElement {
  return new window.DOMParser().parseFromString(`<body>${value}</body>`, "text/html")
    .body;
}

/** tiptap-markdown adds its parser to storage without augmenting TipTap types. */
interface MarkdownStorage {
  markdown: {
    parser: { parse(content: string, options?: { inline?: boolean }): string };
  };
}

/** Whether the cursor is inside a task or bullet list item. */
function inListItem(editor: Editor): boolean {
  const $from = editor.state.selection.$from;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "taskItem" || name === "listItem") return true;
  }
  return false;
}

/**
 * Parses Markdown `text` and inserts it into the selection. Returns `false`
 * unchanged when the text has no Markdown signals or parses to an empty slice.
 *
 * **The cursor position decides the shape of a block paste**, which preserves
 * both imported subtasks and normal prose around the paste:
 *
 * - Inside a list, the slice remains open: its first task merges into the
 *   active item (or replaces a new empty task), and its siblings attach in
 *   place.
 * - Elsewhere, a block arrives complete (`openStart`/`openEnd` are zero), so
 *   its nested tasks do not flatten into the surrounding paragraph.
 */
export function pasteScratchpadMarkdown(editor: Editor, text: string): boolean {
  if (!containsScratchpadMarkdown(text)) return false;
  const parser = (editor.storage as unknown as MarkdownStorage).markdown?.parser;
  if (!parser) return false;

  const view = editor.view;
  const asBlock = containsScratchpadMarkdownBlock(text) && !inListItem(editor);
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
            // Without companion HTML, tiptap-markdown already parses the text.
            if (!text || !data.getData("text/html")) return false;
            return pasteScratchpadMarkdown(editor, text);
          },
        },
      }),
    ];
  },
});
