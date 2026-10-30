import { defaultDropAnimationSideEffects, type DropAnimation, type Modifier } from "@dnd-kit/core";

/**
 * How far the pointer travels before a press becomes a drag, for every
 * drag-and-drop surface of the app (cards, tabs, view pills, rows, columns).
 * A few pixels of resistance, as in Linear: a click that slips by a pixel
 * stays a click, and a deliberate drag still starts at once.
 */
export const DRAG_ACTIVATION_DISTANCE = 4;

/**
 * A released overlay settles where its item now stands: in its new place
 * after a reorder, back at its origin after a cancel. Without it the overlay
 * vanished and the item reappeared on the spot.
 */
export const SETTLE_DROP_ANIMATION: DropAnimation = {
  duration: 180,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
};

/**
 * A strip of tabs or pills reorders along its line only, never up or down:
 * the app tabs, the board's view pills, a database's views.
 */
const restrictToHorizontalAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 });
export const HORIZONTAL_DRAG: Modifier[] = [restrictToHorizontalAxis];

/**
 * The background of a dragged pill that has none at rest (an inactive view):
 * the hover tint, made opaque, so the copy hides what it passes over.
 */
export const DRAGGED_PILL_BG = "bg-[color-mix(in_oklab,var(--background)_90%,var(--foreground))] text-foreground";
