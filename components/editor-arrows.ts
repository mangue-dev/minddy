import { Extension, textInputRule } from "@tiptap/core";

/**
 * “->” becomes “→” under the fingers, as in Notion.
 *
 * It is an INPUT rule, not a rendering: the character written in the document
 * — and therefore in the saved markdown — is the real arrow. Nothing to
 * reinterpret upon rereading, and the text copied elsewhere leaves with its arrow.
 *
 * Both rules are triggered on the SAME character, the final “>”, and it is
 * which makes them predictable: each goes back from there to the beginning of the
 * arrow, dashes and “< » compris. `-->` therefore gives a single arrow and not
 * “-→”, and `<->` gives “↔” and not “<→”. A rule that would be triggered on
 * a non-final character — a “<-” alone, without anything closing it — would cut
 * the grass under the feet of the other two: it does not exist, and “<-” therefore remains
 * tel quel.
 *
 * What the rules do not touch, and this is intentional: code blocks and
 * inline code, which the tiptap rules engine itself discards (the `a -> b`
 * of sample code is still code). And a substitution that we didn't want
 * does not cancel with a Backspace, which returns the typed characters.
 *
 * Placed on the two rich text surfaces — the task notebook and
 * <MarkdownEditor> (description d'un ticket, d'un objectif, d'un retour), donc
 * the mode of creation understood.
 */
export const Arrows = Extension.create({
  name: "arrows",

  addInputRules() {
    return [
      // Before the single arrow: “<->” is indeed a double arrow, not a
      // “<” followed by an arrow.
      textInputRule({ find: /<-{1,2}>$/, replace: "↔" }),
      textInputRule({ find: /-{1,2}>$/, replace: "→" }),
    ];
  },
});
