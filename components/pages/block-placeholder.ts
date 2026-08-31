// The PLACEHOLDER of an empty block (MIN-270) — a plugin of ours, and why.
//
// `Placeholder` from @tiptap/extensions has only two modes, and neither is suitable:
//
// - by default (`includeChildren: false`), it only looks at the node of
// DEPTH 1. For a list item or a quote line, this is the
// `<ul>` or `<blockquote>` — not a block of text: nothing was decorated,
// and half of the empty blocks remained silent;
// - with `includeChildren`, it decorates any node whose RANGE contains the
// cursor, limits included. Two empty blocks that touch each other share a
// terminal: the cursor placed between them turned them both on, plus their
// empty ancestors. Three placeholders for a slider.
//
// And we cannot catch the second from the text callback: it is
// called during the `apply` of the transaction, where `editor.state` is still
// the BEFORE state. The block we have just reached is therefore invisible.
//
// Hence this plugin. It comes down to one rule — the block of text that CONTAINS the
// cursor, if empty — and reads it into `props.decorations(state)`, to which
// ProseMirror switches to current state. A single placeholder, at the right depth,
// never late for a keystroke.
//
// No "use client" or component import: this module is mounted by the
// registre de blocs, qui doit rester importable hors navigateur (cf. lib/cx.ts).

import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { useTranslations } from "next-intl";

type PagesTranslator = ReturnType<typeof useTranslations<"Pages">>;

/** The class placed on the decorated block — the CSS of `.page-editor` paints it. */
export const PLACEHOLDER_CLASS = "is-empty";

export interface BlockPlaceholderOptions {
  /** The text to display, or an empty string to display nothing. */
  text: (context: { node: Node; depth: number }) => string;
}

export const BlockPlaceholder = Extension.create<BlockPlaceholderOptions>({
  name: "blockPlaceholder",

  addOptions() {
    return { text: () => "" };
  },

  addProseMirrorPlugins() {
    const { editor, options } = this;

    /**
 * Does the editor have the CURSOR?
 *
 * A selection survives the focus: clicking outside the document leaves the caret
 * where it was, and the placeholder therefore remained lit on a line that
 * no one was editing anymore — an invitation to write placed on a document
 * that we left.
 *
 * The flag is held here rather than read on `editor.isFocused`: this one
 * is updated by tiptap's own listeners, and there is no guarantee
 * that they come before ours. And since a focus does not produce any
 * transaction, you have to push one empty so that ProseMirror recalculates
 * the decorations — without it, the placeholder would only turn off on the
 * next keystroke.
 */
    let focused = false;

    return [
      new Plugin({
        key: new PluginKey("blockPlaceholder"),
        props: {
          handleDOMEvents: {
            focus: (view) => {
              focused = true;
              view.dispatch(view.state.tr);
              return false;
            },
            blur: (view) => {
              focused = false;
              view.dispatch(view.state.tr);
              return false;
            },
          },
          decorations(state: EditorState) {
            if (!editor.isEditable || !focused) return null;
            const { selection } = state;
            // A SELECTION is not a cursor: we do not invite you to write there
            // where the user is choosing text.
            if (!selection.empty) return null;

            const { $anchor } = selection;
            if ($anchor.depth === 0) return null;
            const node = $anchor.parent;
            if (!node.type.isTextblock || node.content.size > 0) return null;

            const text = options.text({ node, depth: $anchor.depth });
            if (!text) return null;

            const pos = $anchor.before($anchor.depth);
            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, {
                class: PLACEHOLDER_CLASS,
                "data-placeholder": text,
              }),
            ]);
          },
        },
      }),
    ];
  },
});

/**
 * The text, which DEPENDS on the empty block under the cursor.
 *
 * A single invitation ("type / for blocks") repeated on an empty title,
 * an empty list item and an empty quote line says the same thing three times
 * thing at the wrong time: in a list, "/" is not what we are looking for,
 * it is text. A title therefore announces its level, a nested block invites
 * just to write, and only the first level line — the only one where the
 * catalog is the right gesture — carries the complete invitation.
 */
export function pagePlaceholder(t: PagesTranslator) {
  return ({ node, depth }: { node: Node; depth: number }): string => {
    // A code block owns its entire visual surface, including its empty state.
    // Painting the page-level new-line prompt on the node-view wrapper leaves
    // that prompt visible behind the code editor.
    if (node.type.name === "codeBlock") return "";
    if (node.type.name === "heading") {
      const level = node.attrs.level as number;
      if (level === 1) return t("blockHeading1");
      if (level === 2) return t("blockHeading2");
      return t("blockHeading3");
    }
    // Depth 1 = direct child of the document. Beyond that, the block is IN a
    // other (list, quote, leaflet, task).
    if (depth > 1) return t("placeholderNested");
    return t("placeholder");
  };
}
