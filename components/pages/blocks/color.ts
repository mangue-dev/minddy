// The COLOR of a page passage — text and background.
//
// Two decisions hold this entire file.
//
// 1. It's a MARK, not a node attribute. A color placed on the knot
// would color the entire block; a mark colors what is selected, so
// three words in the middle of a sentence as a whole block when selecting
// covers it. This is the gesture of Notion, and it is also what is serialized in
// HTML without inventing a block attribute. The price, assumed: the markdown has no
// no color, so it does not survive projection (MIN-269).
//
// 2. The mark stores a NAME of the palette (“red”), never a color. One hex
// frozen in the document would be right in one theme and wrong in the other — one
// readable red on white is illegible on black. The name resolves into
// CSS, where each theme gives its value (`--page-color-*` in
// app/globals.css). Changing the theme recolors the document without rewriting it.
//
// And the palette is not invented: it is THAT OF THE PRODUCT, that of
// category labels (lib/category-colors.ts), with its names already translated
// in `Categories.colors`. A single color source in minddy — and
// lib/pages-color.test.ts checks that the CSS tokens still match it.

import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/category-colors";
import type { MessageKey } from "@/lib/i18n-keys";

/** A name of the palette — and, as is, an i18n key of `Categories.colors`. */
export type PageColor = MessageKey<"Categories.colors">;

/** The page palette: that of the labels, in its order, by NAME. */
export const PAGE_COLORS: readonly PageColor[] = CATEGORY_COLORS.map(
  (hex) => CATEGORY_COLOR_NAMES[hex]
);

/** Both colorable dimensions. Only one mark each: placing a background should not erase a text color, nor vice versa. */
export type PageColorKind = "text" | "background";

/** The HTML attribute carried by each mark. It is HIM that the CSS targets, and it is
 which makes the color rereadable after copying and pasting. */
export const PAGE_COLOR_ATTRIBUTE: Record<PageColorKind, string> = {
  text: "data-page-text",
  background: "data-page-back",
};

/** The tiptap name of each mark. */
export const PAGE_COLOR_MARK: Record<PageColorKind, string> = {
  text: "pageTextColor",
  background: "pageBackgroundColor",
};

function colorMark(kind: PageColorKind) {
  const attribute = PAGE_COLOR_ATTRIBUTE[kind];
  return Mark.create({
    name: PAGE_COLOR_MARK[kind],

    addAttributes() {
      return {
        color: {
          default: null as PageColor | null,
          parseHTML: (element: HTMLElement) => element.getAttribute(attribute),
          renderHTML: (attributes: { color?: PageColor | null }) =>
            attributes.color ? { [attribute]: attributes.color } : {},
        },
      };
    },

    // `span[…]` and not `span`: without the attribute selector, the mark would be caught
    // any `<span>` pasted from anywhere and the document would fill with
    // marks sans couleur.
    parseHTML() {
      return [{ tag: `span[${attribute}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes), 0];
    },

    /**
 * The color is not stated in markdown: it is LOST when projected,
 * properly — the text passes, the mark falls (see lib/pages-markdown.ts).
 *
 * Declaring it explicitly is not a repeat of the comment header.
 * Without markdown spec, tiptap-markdown falls back on its HTML serialization of the
 * unknown marks and writes `<span data-page-text="red">…</span>` in the middle of the
 * markdown: the color would then not be lost but COPIED back into tag,
 * in what Numo reads. A clear loss is better than an escape.
 */
    addStorage() {
      return {
        markdown: { serialize: { open: "", close: "" }, parse: {} },
      };
    },
  });
}

/** The two marks, to be mounted with the rest of the editor. */
export const pageColorExtensions = () => [
  colorMark("text"),
  colorMark("background"),
];

/* ── What the menu calls ──────────────────────── ───────────────────────── */

/**
 * Place (or remove, with `null`) a color on the current selection.
 *
 * Nothing particular to do for the multi-block selection: `setMark` operates
 * on the RANGES of the selection, and a `NodeRangeSelection` carries one per
 * block — three selected blocks are therefore colored with a single call.
 */
export function setPageColor(
  editor: Editor,
  kind: PageColorKind,
  color: PageColor | null
): boolean {
  const name = PAGE_COLOR_MARK[kind];
  const chain = editor.chain().focus();
  return color
    ? chain.setMark(name, { color }).run()
    : chain.unsetMark(name).run();
}

/** The color in effect where the cursor is, or `null` for “none”. */
export function activePageColor(
  editor: Editor,
  kind: PageColorKind
): PageColor | null {
  const { color } = editor.getAttributes(PAGE_COLOR_MARK[kind]) as {
    color?: PageColor | null;
  };
  return color ?? null;
}
