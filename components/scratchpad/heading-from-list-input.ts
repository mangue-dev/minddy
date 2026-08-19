import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";

type ListItemName = "taskItem" | "listItem";

function listItemAt(state: EditorState): ListItemName | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === "taskItem" || name === "listItem") return name;
  }
  return null;
}

/**
 * The heading marker immediately before an empty caret in a paragraph, or
 * null. Heading input rules cannot change a task item's first paragraph into
 * a heading because that node's schema requires a paragraph there.
 */
function headingMarkerAtCaret(state: EditorState): string | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "paragraph") return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, "\0", "\0");
  const after = $from.parent.textBetween(
    $from.parentOffset,
    $from.parent.content.size,
    "\0",
    "\0"
  );
  return /^#{1,3}$/.test(before) && after === "" ? before : null;
}

/**
 * Lets `# `, `## ` and `### ` create headings from an otherwise empty list
 * item. Pressing Enter at the end of a task creates another task, where
 * TipTap's built-in heading input rule cannot apply; without this bridge the
 * marker remains literal and is persisted as `\#` in Markdown.
 */
export const HeadingFromListInput = Extension.create({
  name: "headingFromListInput",
  priority: 1_000,

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("headingFromListInput"),
        props: {
          handleTextInput: (_view, _from, _to, text) => {
            if (text !== " ") return false;
            const marker = headingMarkerAtCaret(editor.state);
            if (!marker || !listItemAt(editor.state)) return false;

            // A nested item must leave every list level before its paragraph
            // can become a heading. Each lift updates the current selection.
            for (let i = 0; i < 20; i++) {
              const item = listItemAt(editor.state);
              if (!item) break;
              if (!editor.commands.liftListItem(item)) return false;
            }

            const { $from } = editor.state.selection;
            if (
              $from.parent.type.name !== "paragraph" ||
              $from.parent.textContent !== marker
            ) {
              return false;
            }
            if (!editor.commands.setNode("heading", { level: marker.length })) {
              return false;
            }

            const selection = editor.state.selection;
            return editor.commands.deleteRange({
              from: selection.$from.start(),
              to: selection.$from.pos,
            });
          },
        },
      }),
    ];
  },
});
