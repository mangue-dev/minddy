"use client";

// Keyboard shortcuts that act on “what is under the pointer”:
// field pickers of a ticket card (S/P/E/A/L/D/O), ⇧A/⇧P on a task
// from the notebook, “@” on a card. All follow the same rule — **the target is
// decided at the time of typing**, by asking the DOM which is `:hover`.
//
// This rule exists because the obvious implementation is wrong (MIN-158).
// Keep hover in a React state and subscribe the listener from a
// `useEffect` slips a **passive effect** between moving the pointer and
// moving the listener: React flushes these effects after painting, not at
// the end of the mouse event. We go from card A to card B, we type
// in this window, and it's A who's still listening — and like these handlers
// call `stopImmediatePropagation()`, B wouldn't even see the key already
// subscribed. The window is invisible on a page at rest and wide on a page
// loaded: this is exactly what “every now and then it goes on” looks like
// the map from before”.
//
// `:hover` does not have this offset: the browser updates it during the
// hit-test, in the same breath as `mouseenter`. It also repairs everything
// alone — a lost `mouseleave`, an element unmounted under the cursor, a layer
// which covers the map — where a memorized flag would remain out of date.

import { useCallback, useRef } from "react";

/**
 * The value entered for the INNERmost of the elements hovered over, or
 * `undefined` if no entry is under the pointer.
 *
 * `:hover` is valid for the entire ancestry: a task nested in a task,
 * a card in a panel, are both hovered over. Taking the innermost
 * is the only reading that matches what the user is aiming for.
 * Since hovering forms a single path from the root, two hovered entries
 * are always one inside the other: `contains` cuts every time.
 *
 * We query the registrants one by one rather than the entire document
 * (`querySelectorAll(":hover")`): the cost follows the number of cards mounted, not
 * the size of the DOM — and this rotates on EACH keystroke, including while writing a
 * description.
 */
export function innermostHovered<T>(
  registry: Map<Element, T>,
  isHovered: (el: Element) => boolean = (el) => el.matches(":hover")
): T | undefined {
  let innermost: Element | null = null;
  for (const el of registry.keys()) {
    if (!isHovered(el)) continue;
    if (!innermost || innermost.contains(el)) innermost = el;
  }
  return innermost ? registry.get(innermost) : undefined;
}

/**
 * Is the pointer OUTDATED, that is to say placed there without having been put there for
 * this keystroke? On an editable surface - the notebook - this question decides
 * alone between "shortcut" and "letter".
 *
 * Elsewhere, just look at the target of the event: we do not take the
 * key when it goes into a field (see `isTypingTarget`). The notebook,
 * IS an end-to-end field, and it takes focus when opened: the same
 * rule would turn off ⇧A/⇧P forever. What distinguishes the two gestures
 * is therefore not the focus, it is the pointer — aimed at the moment, or left there
 * while writing elsewhere.
 *
 * Hence the flag: writing expires the pointer, moving it refreshes it. A
 * task hovered over for ten minutes while writing the line above
 * no longer receives anything; aiming it again, even with a quiver, puts it back into play. It's a boolean and not two timestamps: only the order of the two gestures
 * counts, never the delay between them.
 */
let pointerStale = false;
let pointerTrackers = 0;
const freshenPointer = () => {
  pointerStale = false;
};

/** To be called on each keystroke received by the editable surface. */
export function noteTyping(): void {
  pointerStale = true;
}

/** True as long as we have written without moving the pointer since. */
export function pointerIsStale(): boolean {
  return pointerStale;
}

/**
 * Tracks pointer movements as long as the editable surface is mounted.
 * Returns unsubscription. A single listener, passive, which only writes a boolean.
 */
export function trackPointerFreshness(): () => void {
  pointerStale = false;
  if (pointerTrackers++ === 0)
    window.addEventListener("pointermove", freshenPointer, {
      capture: true,
      passive: true,
    });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    if (--pointerTrackers === 0)
      window.removeEventListener("pointermove", freshenPointer, true);
  };
}

type HoverKeyHandler = (e: KeyboardEvent) => void;

const handlers = new Map<Element, HoverKeyHandler>();

function dispatch(e: KeyboardEvent) {
  innermostHovered(handlers)?.(e);
}

/**
 * Registers `handler` as the hover handler of `el`. Returns his unsubscription.
 *
 * A single listener `keydown` for the entire application, mounted at the first registered
 * and removed at the last: one hundred cards do not make one hundred listeners, and there is
 * no more order of subscription between cards on which which would depend wins.
 */
export function registerHoverKeys(
  el: Element,
  handler: HoverKeyHandler
): () => void {
  if (handlers.size === 0) window.addEventListener("keydown", dispatch, true);
  handlers.set(el, handler);
  return () => {
    if (!handlers.delete(el)) return;
    if (handlers.size === 0)
      window.removeEventListener("keydown", dispatch, true);
  };
}

/**
 * Executes `handler` on each keystroke while the pointer is on the element
 * carrying the rendered ref. Render a **callback ref**: place it on the element (the
 * merge with the other refs it already carries, without returning anything from the
 * merger so that React calls back with `null` when unmounting).
 *
 * `handler` and `enabled` is read by ref: the subscription is done once, at
 * assembly. Nothing in it depends on hover, so nothing can delay on the
 * pointer.
 */
export function useHoverKeys(
  handler: HoverKeyHandler,
  enabled = true
): (el: Element | null) => void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const unsubscribe = useRef<(() => void) | null>(null);

  return useCallback((el: Element | null) => {
    unsubscribe.current?.();
    unsubscribe.current = el
      ? registerHoverKeys(el, (e) => {
          if (enabledRef.current) handlerRef.current(e);
        })
      : null;
  }, []);
}
