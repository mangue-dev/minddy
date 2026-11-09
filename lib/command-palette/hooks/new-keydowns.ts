/**
 * Listens to the keys pressed from now on, never to the one being handled.
 *
 * The palette often opens from a key: Enter on a menu row (R's relation
 * types, a dropdown's "Relations" entry) publishes a picker, and React
 * mounts the palette in the microtask that follows its own handler. React
 * handles a portaled menu's keys on the portal's container (`<body>`), so the
 * palette's `document` listeners are attached while that same Enter is still
 * bubbling up: without this guard they receive it, run the palette's first
 * row and close it at once (a parent set on the first ticket listed).
 *
 * A key event carries the time it was pressed; a listener ignores every key
 * older than itself. The reference time comes from a fresh event, so both use
 * the same clock in every environment.
 */
export function listenToNewKeydowns(
  target: Document | Window,
  handler: (event: KeyboardEvent) => void,
  options?: boolean | AddEventListenerOptions,
): () => void {
  const since = new Event("keydown").timeStamp;
  const listener = (event: Event) => {
    if (event.timeStamp < since) return;
    handler(event as KeyboardEvent);
  };
  target.addEventListener("keydown", listener, options);
  return () => target.removeEventListener("keydown", listener, options);
}
