import { Paragraph } from "@tiptap/extension-paragraph";
import { PilcrowIcon as Pilcrow } from "@hugeicons/core-free-icons";
import type { MarkdownNode, MarkdownState, PageBlock } from "@/components/pages/blocks/types";
import { SPACER_LINE } from "@/lib/scratchpad";

/**
 * An empty paragraph between two blocks is a blank line a person left on
 * purpose, and Markdown has no way to say it: blank lines only separate
 * blocks. It vanished from the projection, and with it from every save,
 * comparison and agent read that goes through Markdown (MIN-745).
 *
 * It is written as the notebook writes its spacers (SPACER_LINE, see
 * components/scratchpad/scratchpad-paragraph.ts): a lone non-breaking space,
 * which renders blank everywhere yet is not a Markdown blank line.
 *
 * Only an empty paragraph with content on BOTH sides is written. The leading
 * and trailing ones are the editor's own room — StarterKit's trailing
 * paragraph, an empty list item, quote or callout — and writing them would put
 * a spacer in almost every document for nothing a person meant.
 */
function isEmptyParagraph(node: MarkdownNode): boolean {
  return node.type.name === "paragraph" && node.childCount === 0;
}

function isSpacer(parent: MarkdownNode | undefined, index: number): boolean {
  if (!parent || !isEmptyParagraph(parent.child(index))) return false;
  let before = false;
  for (let i = index - 1; i >= 0 && !before; i--) before = !isEmptyParagraph(parent.child(i));
  let after = false;
  for (let i = index + 1; i < parent.childCount && !after; i++) after = !isEmptyParagraph(parent.child(i));
  return before && after;
}

function paragraphToMarkdown(
  state: MarkdownState,
  node: MarkdownNode,
  parent: MarkdownNode,
  index: number
): void {
  if (isSpacer(parent, index)) state.write(SPACER_LINE);
  else state.renderInline(node);
  state.closeBlock(node);
}

/** The default block: this is what `Enter` creates, and it is this that
 “transform into” brings back. */
export const paragraphBlock: PageBlock = {
  id: "paragraph",
  nodeName: "paragraph",
  extensions: [
    Paragraph.extend({
      addStorage() {
        return {
          ...this.parent?.(),
          markdown: {
            serialize: paragraphToMarkdown,
            parse: {
              // markdown-it renders a spacer (or an agent's `&nbsp;`) as
              // `<p>&nbsp;</p>`; emptied, it reads back as an empty paragraph,
              // with no stray space under the caret.
              updateDOM(element: HTMLElement) {
                element.querySelectorAll("p").forEach((p) => {
                  if (p.textContent === SPACER_LINE) p.textContent = "";
                });
              },
            },
          },
        };
      },
    }),
  ],
  icon: Pilcrow,
  labelKey: "blockParagraph",
  slash: {
    group: "basic",
    order: 0,
    keywords: ["paragraph", "paragraphe", "text", "texte", "plain"],
  },
  turnInto: (editor) => editor.chain().focus().setParagraph().run(),
  isActive: (editor) => editor.isActive("paragraph"),
  shortcut: { keys: "Mod-Alt-0", display: "⌘⌥0" },
  markdown: { sample: `Some text\n\n${SPACER_LINE}\n\nMore text` },
};
