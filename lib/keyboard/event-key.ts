/**
 * Lowercased `event.key`, or `""` when the event carries no key at all.
 *
 * Every global `keydown` listener sees *all* keydown events on the window —
 * including synthetic ones dispatched by browser extensions (password managers,
 * spell checkers, autofill) and IME layers, which routinely build them with
 * `new Event("keydown")` and therefore have no `key` property. Reading
 * `e.key.toLowerCase()` on one of those throws and, because the listener is
 * global, takes the whole app down on an ordinary keystroke.
 *
 * `""` never matches a real shortcut, so callers just fall through.
 */
export function eventKey(e: Pick<KeyboardEvent, "key">): string {
  return typeof e.key === "string" ? e.key.toLowerCase() : "";
}
