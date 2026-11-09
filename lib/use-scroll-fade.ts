import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";

/** Default height/width of the soft fade zone at each scrollable edge. */
const FADE = "2rem";

function maskImage(
  start: boolean,
  end: boolean,
  axis: "x" | "y",
  fade: string
): string | undefined {
  if (!start && !end) return undefined;
  const dir = axis === "y" ? "to bottom" : "to right";
  const from = start ? `transparent, #000 ${fade}` : "#000";
  const to = end ? `#000 calc(100% - ${fade}), transparent` : "#000";
  return `linear-gradient(${dir}, ${from}, ${to})`;
}

/**
 * Softly fades the leading and/or trailing edge of a scroll container to hint
 * that the content continues past the edge — but only on the side(s) that
 * actually have more to reveal (leading once scrolled off the start, trailing
 * until the end). Pass `"x"` for a horizontal scroller (default is vertical).
 *
 * Merge `ref` with any other ref on the scroll element and spread `scrollProps`
 * (an `onScroll` handler + the mask `style`) onto it. The mask only changes when
 * an edge crosses its threshold, so scrolling stays cheap.
 *
 * Works the same on a box that only CLIPS (`overflow: hidden`): nothing scrolls,
 * so only the trailing edge ever fades — which is exactly the "there is more
 * text below" of a truncated preview. Such a preview wants a longer ramp than a
 * scroller's edge hint, hence `fade`.
 */
export function useScrollFade<T extends HTMLElement>(
  axis: "x" | "y" = "y",
  fade: string = FADE
) {
  const elRef = useRef<T | null>(null);
  // The node is ALSO a state: the observed element may only arrive after the
  // first rendering (a preview which is only shown once its data is there, cf.
  // reception), and the effect must then be replayed to observe it. With the only
  // ref, it revolved once in a vacuum and nothing ever measured again.
  const [node, setNode] = useState<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const frameRef = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const offset = axis === "y" ? el.scrollTop : el.scrollLeft;
    const client = axis === "y" ? el.clientHeight : el.clientWidth;
    const scroll = axis === "y" ? el.scrollHeight : el.scrollWidth;
    const start = offset > 1;
    const end = offset + client < scroll - 1;
    setEdges((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, [axis]);

  /**
 * Measured AT MOST ONCE PER IMAGE.
 *
 * These three reads (`scrollTop`, `clientHeight`, `scrollHeight`) force the
 * browser to recalculate the layout, and what triggers them is not not
 * a user gesture: it's a `MutationObserver` in `subtree`, therefore
 * ANY change in content. A streaming agent thread rewrites its markdown
 * several times per second, each rewrite stirs hundreds of nodes —
 * so we measured at this rate, blocking the main thread each
 * time. This is what made the entire interface, including the sidebar
 *, "jump" at the precise moment when the agent starts writing.
 *
 * One image is enough: no one can see a fade appear earlier.
 */
  const update = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      measure();
    });
  }, [measure]);

  const ref = useCallback<RefCallback<T>>((el) => {
    elRef.current = el;
    // Detaches never update the state. A caller whose ref identity changes on
    // every render (an inline wrapper) would otherwise detach → setNode(null)
    // → one scheduled render per render, a self-sustaining update loop that
    // ends in React error #185 once renders go synchronous (MIN-560). The
    // observer effect's cleanup disconnects on unmount, so a node left behind
    // here is never observed after the element is gone.
    if (el) setNode(el);
  }, []);

  // Recompute when the container resizes or its content changes (add/remove/
  // reorder), so the trailing fade appears/disappears without a scroll event.
  useEffect(() => {
    const el = node;
    if (!el) return;
    update();
    // Absent from some environments (jsdom): the scroll handler still measures.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    const mo = new MutationObserver(update);
    // `characterData` too: typing into an editable scroller changes text nodes
    // only, and a line that wraps past the cap neither adds a node nor resizes
    // the (capped) scroller, so its trailing fade stayed over the new line.
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      ro?.disconnect();
      mo.disconnect();
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [node, update]);

  const mask = maskImage(edges.start, edges.end, axis, fade);
  const scrollProps = {
    onScroll: update,
    style: mask
      ? ({ WebkitMaskImage: mask, maskImage: mask } as CSSProperties)
      : undefined,
  };

  // `edges` comes out with the rest: “there is content left on this side” serves beyond the
  // fade — this is also the condition for a back button at the bottom (the agent thread).
  // Measuring it twice on the same node would not teach anything more.
  return { ref, scrollProps, edges };
}

/**
 * Keeps the caret of an editable scroller clear of its edge fades.
 *
 * The browser scrolls the caret just into view while typing, which leaves the
 * caret line under the trailing fade (a scroller with bottom padding is never
 * "at the end" then). Typing at the end of the text scrolls to the very bottom,
 * which also lifts the fade; elsewhere the caret line is moved out of the fade
 * zone of `fadePx` at either edge. Call it after an input event.
 */
export function revealCaretClearOfFade(scroller: HTMLElement, fadePx: number) {
  const selection = typeof window === "undefined" ? null : window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const caret = selection.getRangeAt(0);
  if (!scroller.contains(caret.endContainer)) return;
  if (scroller.scrollHeight <= scroller.clientHeight) return;
  const rest = document.createRange();
  rest.selectNodeContents(scroller);
  rest.setStart(caret.endContainer, caret.endOffset);
  if (rest.toString().trim() === "") {
    scroller.scrollTop = scroller.scrollHeight;
    return;
  }
  // A caret on an empty line has no box of its own: use its line's element.
  let rect = caret.getBoundingClientRect();
  if (rect.height === 0) {
    const node = caret.endContainer;
    const host = node.nodeType === Node.ELEMENT_NODE
      ? ((node as Element).childNodes[caret.endOffset] ?? node)
      : node.parentElement;
    if (host instanceof Element) rect = host.getBoundingClientRect();
  }
  if (rect.height === 0) return;
  const box = scroller.getBoundingClientRect();
  if (rect.bottom > box.bottom - fadePx) {
    scroller.scrollTop += rect.bottom - (box.bottom - fadePx);
  } else if (rect.top < box.top + fadePx && scroller.scrollTop > 0) {
    scroller.scrollTop -= box.top + fadePx - rect.top;
  }
}
