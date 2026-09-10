/**
 * “->” becomes “→” while typing — the textarea-side twin of the ProseMirror
 * input rules in components/editor-arrows.ts. The body of a page gets the
 * conversion from its editor engine; plain text fields (the page title) call
 * this helper by hand from their `onChange`.
 *
 * As in the editor, the substitution is committed into the VALUE itself, not
 * a rendering trick: the sidebar, search, breadcrumbs and notifications all
 * read the saved title, so what they must find is the real arrow.
 *
 * Both patterns trigger on the same closing “>”, which keeps them
 * predictable: each walks back to the start of the arrow, dashes and “<”
 * included. `-->` therefore gives a single arrow and not “-→”, and `<->`
 * gives “↔” and not “<→”. A rule firing on a non-final character — a lone
 * “<-”, with nothing closing it — would step on the other two's toes: it does
 * not exist, and “<-” stays as typed.
 *
 * The caret comes back AFTER the arrow: the character that triggered the
 * substitution was the last one, so the cursor rests where the typing
 * continued.
 */
export function applyArrowRule(
  text: string,
  caret: number
): { text: string; caret: number } | null {
  const before = text.slice(0, caret);
  // The double arrow first: “<->” is an arrow pair, not “<” followed by one.
  const double = /<-{1,2}>$/.exec(before);
  const match = double ?? /-{1,2}>$/.exec(before);
  if (!match) return null;
  return {
    text:
      before.slice(0, before.length - match[0].length) +
      (double ? "↔" : "→") +
      text.slice(caret),
    caret: caret - match[0].length + 1,
  };
}
