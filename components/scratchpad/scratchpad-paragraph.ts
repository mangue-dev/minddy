import { Paragraph } from "@tiptap/extension-paragraph";
import { SPACER_LINE } from "@/lib/scratchpad";

/**
 * Paragraph that preserves DELIBERATE empty lines across the Markdown round-trip.
 *
 * The note is stored as Markdown, which collapses runs of blank lines — so the
 * empty paragraphs a user types to space sections apart normally vanish on
 * close/reopen. We keep them by serializing an empty paragraph as a lone
 * non-breaking space (SPACER_LINE): it renders blank yet is NOT a Markdown blank
 * line, so each spacer survives as its own paragraph. On the way back in,
 * `parse.updateDOM` re-empties those `<p>` so they behave like true empty lines
 * (no stray nbsp when the caret lands there). Copied prompts are cleaned of the
 * sentinel via `stripScratchpadSpacers` in lib/scratchpad-prompt.ts.
 *
 * Wired in scratchpad-editor.tsx with `StarterKit.configure({ paragraph: false })`
 * so this replaces the built-in paragraph.
 */
export const ScratchpadParagraph = Paragraph.extend({
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: any, node: any, parent: any, index: number) {
          // An empty paragraph is a deliberate spacer line — encode it so the
          // blank line survives Markdown's blank-line collapsing. EXCEPT the
          // final trailing paragraph, which the editor keeps as an editing
          // affordance (a cursor landing spot), not something the user typed:
          // collapse it like the default serializer so notes don't accumulate a
          // trailing spacer on every save.
          const isLast = parent ? index === parent.childCount - 1 : true;
          if (node.content.size === 0 && !isLast) {
            state.write(SPACER_LINE);
            state.closeBlock(node);
            return;
          }
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {
          // markdown-it turns a spacer line into `<p>&nbsp;</p>`; strip the nbsp
          // back out so ProseMirror parses a genuinely empty paragraph.
          updateDOM(element: HTMLElement) {
            element.querySelectorAll("p").forEach((p) => {
              if (p.textContent === SPACER_LINE) p.textContent = "";
            });
          },
        },
      },
    };
  },
});
