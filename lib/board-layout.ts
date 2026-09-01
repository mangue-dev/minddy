/**
 * The width of a board column, and why it is not `w-full` under
 * 1200 px (MIN-293), regardless of the Chrome desktop threshold.
 *
 * The board was a stack of FULL-WIDTH columns that we flipped through
 * finger, one per screen. It's just on a phone; it is no longer so
 * that we resize the desktop app window, where the same rule gave
 * a single column 900 px wide — a ticket card stretched across the entire
 * the window, and five statuses off-screen.
 *
 * Hence a division: the column takes a FRACTION of the space, and the fraction
 * follows the available space.
 *
 * < 640 px 1 column (telephone: the original lamination)
 *     ≥ 640 px   2 colonnes
 *     ≥ 1024 px  3 colonnes
 * ≥ 1200 px 22rem fixed (the complete board, with its sidebar)
 *
 * The calculation removes the gutters BEFORE dividing (`gap-3` = 0.75rem between two
 * columns): without that, two columns at 50% plus a gutter overflow, and the
 * second is cut off to the right — which looks exactly like a bug of a
 * column poorly seated.
 *
 * The scroll hook changes from `snap-center` to `snap-start`: center had
 * meaning when a column filled the screen (center = start); with two or
 * three columns visible, that would leave them straddling both edges. THE
 * same change doesn't change anything to a finger on a phone.
 *
 * ⚠ **Fractions are bounded by `max-wide:`, and this is not decorative.**
 * The above sharing is ONLY worth under 1200 px; above, the column is fixed.
 * Written without limit — `sm:w-… lg:w-… desktop:w-[22rem]` — it overflowed above
 * of the threshold: `lg:` always applied and the column took THIRD of the
 * window. Measured in the browser: 472 px at 1440, 632 px at 1920, instead of 352
 * in both cases — stretched ticket cards, exactly the defect that this
 * partage devait corriger sous 1200 px.
 *
 * The cause is in the ORDER of the media queries, not in the widths. Tailwind
 * sorts the break points by their value, but it does not know how to compare
 * different units: his are in `rem` (`sm` = 40rem, `lg` = 64rem),
 * `--breakpoint-wide` is in `px` (1200px). So the `px` come out
 * IN BLOCK before the `rem`, and the generated sheet ends up
 *
 * @media (width >= 1200px) { … } ← wide, written first
 *     @media (width >= 40rem)   { … }   ← sm
 * @media (width >= 64rem) { … } ← lg, written LAST → he wins
 *
 * With equal specificity, it is the last one which wins: above 1200 px the
 * three rules apply, and `desktop:` loses. No errors, none
 * warning — the mixture `px`/`rem` is not read anywhere in classes.
 *
 * `max-wide:` makes the intervals DISJOINT (`(width < 1200px)` nested
 * around the fraction), so the order no longer decides anything. It is the parade which
 * holds regardless of the sorting: keep it in the event of a redesign of these classes, and
 * remember it before any new `desktop:` placed on a property that `sm:`,
 * `md:`, `lg:`, `xl:` or `2xl:` already poses. [board-layout.test.ts](board-layout.test.ts)
 * compiles these classes for real and reads back the width which gains to five widths
 * window.
 */
export const BOARD_COLUMN_CLASS =
  "w-full shrink-0 snap-start max-wide:sm:w-[calc((100%-0.75rem)/2)] max-wide:lg:w-[calc((100%-1.5rem)/3)] wide:w-[22rem]";

/**
 * The scroller's gutter.
 *
 * It was worth 16 px in compact compared to 24 in large. That is to say, the only case
 * where the sidebar no longer pushes the board inwards was also
 * the one which gave it the least margin: the left column started at
 * edge of the window. It therefore changes to 24 px as soon as there is more than one column,
 * that is to say from `sm` — same number everywhere, except on a phone where 24 px
 * on each side would be taken on the map.
 *
 * ⚠ **Edge fading is no longer set here** (MIN-319). He went through a
 * `mask-image` placed ON this scroller, with a ramp in CSS variable
 * (`--board-fade`) that this class turned off under 640 px. A mask on a
 * container that scrolls makes it re-composed with each frame — and here it was a
 * mask within a mask, each column wearing one too. THE
 * fade is now a layer drawn NEXT to the scroller
 * (`components/scroll-fade-edges.tsx`), driven by the `edges` that renders
 * `useScrollFade`: nothing is placed on the content, therefore nothing to re-compose.
 *
 * The scroll padding must match the visual padding while snapping is enabled.
 * Without it, the browser snaps the first column to the scrollport itself on
 * load, setting `scrollLeft` to 16 or 24 px and consuming the leading gutter.
 */
export const BOARD_SCROLLER_CLASS =
  "flex gap-3 overflow-x-auto px-4 scroll-px-4 after:w-1 after:shrink-0 after:content-[''] snap-x snap-mandatory sm:px-6 sm:scroll-px-6 sm:after:w-3 wide:after:hidden wide:snap-none";
