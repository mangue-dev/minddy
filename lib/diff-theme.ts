import type { LineDiffTypes, ThemesType } from "@pierre/diffs";

/**
 * Diff view skin (MIN-181) — which, from minddy's theme, must
 * cross the Shadow DOM border of `@pierre/diffs`.
 *
 * Two halves, and they don't live in the same place:
 *
 * - **The colors of the FRAME** (background, green/red solids, line numbers) are
 * CSS variables `--diffs-*`, placed on `.pr-diff-view` in
 * [app/globals.css](../app/globals.css). Custom properties
 * CROSS the shadow boundary by inheritance: the lib reads them in its
 * `:host` without having to inject anything. They are written there, with the
 * other tokens in the repository, because they are expressed in `var(--card)`,
 * `var(--foreground)`… — the same as the rest of the app.
 *
 * - **CODE colors** (keywords, strings, comments) come from a
 * Shiki theme, chosen here. More house palette: Shiki colors by
 * TextMate grammar, and a complete theme says what ours approximated.
 *
 * Remains `unsafeCSS`, the only thing we REALLY inject into the shadows: two
 * rules of behavior, no decoration.
 */

/**
 * The light/dark pairing changed to `options.theme`. Pierre's in-house themes
 * rather than a `github-*`: they are calibrated FOR this rendering - the y
 * tokens remain legible placed on the green and red solids of the diff, which is
 * exactly the problem which made us hold a palette in our hand.
 *
 * `themeType` (`"light" | "dark"`), happens separately: it forces the
 * `color-scheme` of the `:host`, therefore the branch that the tens of
 * `light-dark()` of the lib. Without it, they would follow the OS preference —
 * not the theme chosen in minddy.
 */
export const DIFF_THEMES: ThemesType = {
  light: "pierre-light",
  dark: "pierre-dark",
};

/**
 * How to mark, IN a modified line, what has actually changed. This
 * counts as much as the coloring: without this marking, a retouched line of a
 * character appears as entirely rewritten, and the eye must redo the
 * comparison itself.
 *
 * `word-alt` and not `char`: on code (indentation, punctuation), splitting
 * character by character produces a confetti of highlights which serves the
 * reading.
 *
 * Like `DIFF_THEMES`, this setting happens in TWO places — in the component and the
 * worker pool, which wins when it is there (see `PrDiffWorkers`). Hence the
 * constant: two diverging values ​​would give two renderings depending on whether
 * the coloring comes from the worker or the main thread.
 */
export const DIFF_LINE_DIFF_TYPE: LineDiffTypes = "word-alt";

/**
 * CSS injected into the Shadow DOM (`options.unsafeCSS`). Two rules, and
 * both say where the comment "+" is NOT allowed to appear.
 *
 * 1. **An expanded context line is not in the diff.** GitHub returns
 * **422** (`line: could not be resolved`) on a comment placed there —
 * checked against the API. The lib precisely distinguishes `context` (in the patch)
 * from `context-expanded` (reduced by unfolding): the rule is therefore written as
 * a line of CSS, where it requested a set of change keys
 * recalculated each time rendered.
 *
 * 2. **In side-by-side, a context line only anchors to the RIGHT.** It
 * exists on both sides, but commenting context talks about the code as it
 * is AFTER the PR — that's GitHub's choice, and that that we already held.
 * Offering the "+" in the left gutter would produce a `side: LEFT` on
 * an unchanged line: accepted by the forge, but not what the person
 * thinks it denotes.
 *
 * The click is refused a second time on the JS side (`commentAnchor`): the CSS hides
 * the affordance, it does not guarantee the rule — a selection drag can
 * end up on an unfolded line without ever having hovered over the gutter.
 */
/**
 * Attribute set by `pr-diff` on lines covered by a remark
 * MULTI-LINES. It lives here with the CSS rule that paints it: the two halves
 * only make sense together.
 */
export const DIFF_RANGE_ATTRIBUTE = "data-pr-comment-range";

export const DIFF_UNSAFE_CSS = `
/* @pierre/diffs redeclares --diffs-bg on its shadow host. Mirror the app
   surface inside the shadow tree so a dark Minddy theme cannot fall back to
   the renderer's white default. */
:host {
  --diffs-light-bg: var(--minddy-diff-bg) !important;
  --diffs-dark-bg: var(--minddy-diff-bg) !important;
  --diffs-bg: var(--minddy-diff-bg) !important;
  --diffs-light: var(--foreground) !important;
  --diffs-dark: var(--foreground) !important;
  --diffs-fg: var(--foreground) !important;
  background-color: var(--minddy-diff-bg) !important;
  color: var(--foreground) !important;
}
:host, [data-line], [data-code], [data-content] {
  user-select: text !important;
  -webkit-user-select: text !important;
}
[data-line-type="context-expanded"] [data-gutter-utility-slot] { display: none; }
[data-deletions] [data-line-type="context"] [data-gutter-utility-slot] { display: none; }

/* Lines covered by a multi-line comment.
   We do NOT set a background: we override the variable the library uses to
   derive each line's background. It blends over
   \`--diffs-computed-diff-line-bg\`, so the green of an addition and the red of
   a deletion remain legible beneath the tint — unlike a \`background-color\`,
   which would erase them. Same blend, same proportions as the library's
   selection, in a subtler tone: a commented range is a lasting state, not an
   action in progress. */
[${DIFF_RANGE_ATTRIBUTE}] {
  --diffs-computed-selected-line-bg: light-dark(
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 90%, var(--diffs-selection-base)),
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 85%, var(--diffs-selection-base)));
}
/* The gutter carries the vertical line that marks both ends of the range — it is
   more visible than the tint itself, even without reading the code. */
[data-column-number][${DIFF_RANGE_ATTRIBUTE}] {
  --diffs-computed-selected-line-bg: light-dark(
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 82%, var(--diffs-selection-base)),
    color-mix(in lab, var(--diffs-computed-diff-line-bg) 74%, var(--diffs-selection-base)));
  box-shadow: inset 2px 0 0 var(--diffs-selection-base);
  color: var(--diffs-selection-number-fg);
}
`;
