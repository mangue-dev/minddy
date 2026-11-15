/**
 * Scrollbars that show while you scroll and fade once you stop, like the
 * native overlay scrollbars of macOS and iOS.
 *
 * One capturing `scroll` listener on the document (scroll events do not
 * bubble, but they can be captured) marks the scroller that moved with
 * `data-scrollbar="active"`. When it has not moved for `IDLE_DELAY`, the mark
 * becomes `"fading"`, which runs the fade in app/globals.css, and is removed
 * once the fade is over. A scroller that was never scrolled carries no mark at
 * all, so the fade never runs on the thousands of elements of a page.
 */

/** How long a scrollbar stays after the last scroll, close to macOS. */
export const SCROLLBAR_IDLE_DELAY = 1000;
/** Matches the `scrollbar-fade` animation in app/globals.css. */
export const SCROLLBAR_FADE_DURATION = 300;

const ATTR = "data-scrollbar";

export function trackScrollbarActivity(doc: Document = document): () => void {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();

  const settle = (el: Element) => {
    el.setAttribute(ATTR, "fading");
    timers.set(
      el,
      setTimeout(() => {
        timers.delete(el);
        el.removeAttribute(ATTR);
      }, SCROLLBAR_FADE_DURATION),
    );
  };

  const onScroll = (event: Event) => {
    const target = event.target;
    const el =
      target === doc ? doc.documentElement : target instanceof Element ? target : null;
    if (!el) return;
    // Written only when it changes: a style recalculation per scroll event
    // would be wasted work while the bar is already shown.
    if (el.getAttribute(ATTR) !== "active") el.setAttribute(ATTR, "active");
    clearTimeout(timers.get(el));
    timers.set(
      el,
      setTimeout(() => settle(el), SCROLLBAR_IDLE_DELAY),
    );
  };

  doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    doc.removeEventListener("scroll", onScroll, { capture: true });
    for (const [el, timer] of timers) {
      clearTimeout(timer);
      el.removeAttribute(ATTR);
    }
    timers.clear();
  };
}
