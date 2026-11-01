// The page-wide state of a selection rectangle, shared by the boards
// (components/marquee-selection.tsx) and the editor's block rectangle
// (components/editor/block-marquee.ts). Kept apart from the latter so a board
// reads this class without loading the editor engine (MIN-875).

/** The class on <html> while a rectangle is drawn (here or on a board): the
    default cursor everywhere. */
export const MARQUEE_DRAWING_CLASS = "marquee-drawing";

/** Whether a selection rectangle is being drawn: the selection card
    (page-comment-bubble.tsx) waits for its release, as it waits for the end
    of a text drag. */
export function isMarqueeDrawing(): boolean {
  return document.documentElement.classList.contains(MARQUEE_DRAWING_CLASS);
}
