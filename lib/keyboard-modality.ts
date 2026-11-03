/**
 * Keyboard modality (WCAG 2.4.7, MIN-783).
 *
 * The borderless design suppresses the UA focus outline (`app/globals.css`)
 * because Chromium matches `:focus-visible` on any keydown, Shift included,
 * after a mouse click. Many primitives then draw no focus of their own, so a
 * keyboard user could not see where focus was.
 *
 * This marks `<html data-input-modality="keyboard">` from the moment Tab moves
 * focus until the next pointer press. `app/globals.css` draws the focus outline
 * only under that attribute: visible while navigating with the keyboard,
 * absent after a click, whatever key follows it.
 */
export const INPUT_MODALITY_ATTRIBUTE = "data-input-modality";

/** The last gesture that aims: a Tab, or a pointer that moved or pressed. */
let lastAim: "keyboard" | "pointer" = "pointer";

/**
 * True when the latest aiming gesture was Tab. The hover shortcuts read it
 * to pick the focused card over the hovered one; unlike the attribute, a
 * pointer that only moves hands the target back to the hovered card while the
 * focus ring stays drawn.
 */
export function keyboardAimsLast(): boolean {
  return lastAim === "keyboard";
}

export function trackKeyboardModality(root: HTMLElement = document.documentElement): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      root.setAttribute(INPUT_MODALITY_ATTRIBUTE, "keyboard");
      lastAim = "keyboard";
    }
  };
  const onPointerDown = () => {
    root.removeAttribute(INPUT_MODALITY_ATTRIBUTE);
    lastAim = "pointer";
  };
  // A pointer that actually moves; a scroll under a still mouse reports none.
  const onPointerMove = (event: PointerEvent) => {
    if (event.movementX !== 0 || event.movementY !== 0) lastAim = "pointer";
  };
  // Capture phase: a handler that stops propagation (menus, the editor)
  // must not hide the modality change.
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    root.removeAttribute(INPUT_MODALITY_ATTRIBUTE);
    lastAim = "pointer";
  };
}
