import { defaultDropAnimationSideEffects, type DropAnimation } from "@dnd-kit/core";

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
