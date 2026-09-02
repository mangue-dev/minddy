import type { LineDiffTypes, ThemesType } from "@pierre/diffs";

/**
 * Diff chrome inherits Minddy's surface tokens across the Shadow DOM boundary,
 * while Shiki supplies syntax colors. GitHub Dark Default gives unstyled code,
 * identifiers, comments, and punctuation enough contrast on dark diff lines.
 *
 * The renderer still receives both themes because worker-produced token colors
 * use `light-dark()`. Each diff host must therefore force its effective
 * `color-scheme`; otherwise a stale light scheme paints black tokens in dark mode.
 */
export const DIFF_THEMES: ThemesType = {
  light: "pierre-light",
  dark: "github-dark-default",
};

/**
 * Mark changed words instead of every changed character. The same value is sent
 * to the main renderer and worker pool so asynchronous highlighting cannot alter
 * the diff semantics.
 */
export const DIFF_LINE_DIFF_TYPE: LineDiffTypes = "word-alt";

/** Attribute set on every line covered by a multi-line review comment. */
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
:host, :host * {
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
