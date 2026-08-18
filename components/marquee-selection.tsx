"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefCallback,
  type RefObject,
} from "react";

/**
 * Selection lasso on the bottom of the boards, “like on the desk”: press
 * on the bottom, we slide, and any ticket touched by the rectangle enters the
 * selection — the same one that the grouped action pill consumes (MIN-75).
 *
 * Four things are worth saying, because they cannot be guessed:
 *
 * - **Everything is calculated in screen coordinates.** Each column scrolls on its own side
 * and the board scrolls horizontally: reasoning in content coordinates
 * would mean following three origins at once. `getBoundingClientRect` them
 * brings them all back to the same thing. Happy corollary: a card pushed out of its
 * column by scrolling is not caught, because we only take what
 * the rectangle SHOW — `visibleRect` intersects the map with what trims it.
 *
 * - **The rectangle does not go through React.** It is written directly in the
 * style of the `overlayRef` element. A `setState` per image would render all
 * the cards on the board sixty times per second to move a frame. The only one
 * rendering that we trigger is the selection change — and again, filtered:
 * `emit` compares before calling.
 *
 * - **Auto-scroll moves the anchor.** When an edge scrolls, the
 * content slides under a starting point which is fixed on the screen: we
 * shifts by the same amount, otherwise the lasso will become detached from the card from which it started.
 * Only the column where the gesture started counts — scroll ANOTHER
 *   column must pass its cards beneath a stationary rectangle.
 *
 * - **Mouse only.** With your finger, the same gesture is scrolling the board,
 * exactly like dragging and dropping cards (MouseSensor).
 */

/** What the lasso catches: any card that bears its id. */
const ITEM_SELECTOR = "[data-issue-id]";

/** What is not background: a card, a button, a link, a field. */
const IGNORE_SELECTOR = `${ITEM_SELECTOR}, button, a, input, textarea, select, [role="button"], [contenteditable="true"]`;

/** Below, the gesture remains a click (which closes the selection). */
const START_DISTANCE = 5;

/** Width of the edge strip that triggers autoscroll. */
const EDGE = 56;

/** Speed ​​of automatic scrolling at the edge, in pixels per image. */
const MAX_SPEED = 24;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function rectOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );
}

function intersect(a: Box, b: Box): Box | null {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  return right <= left || bottom <= top ? null : { left, top, right, bottom };
}

/** The ancestors who trim the map, from the closest to the board included. */
function clippingAncestors(el: HTMLElement, root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      out.push(node);
    }
    if (node === root) break;
    node = node.parentElement;
  }
  return out;
}

/**
 * The part of the card actually visible. `null` if scrolling its column
 * completely evaded it: we don't select what we don't see.
 *
 * Trimming ancestors are cached for the duration of the gesture — find them
 * asks for a `getComputedStyle` per level, and we go back to each card
 * chaque image.
 */
function visibleRect(
  el: HTMLElement,
  root: HTMLElement,
  cache: Map<HTMLElement, HTMLElement[]>
): Box | null {
  let box: Box | null = rectOf(el);
  let clippers = cache.get(el);
  if (!clippers) {
    clippers = clippingAncestors(el, root);
    cache.set(el, clippers);
  }
  for (const clipper of clippers) {
    box = intersect(box, rectOf(clipper));
    if (!box) return null;
  }
  return box;
}

/** The deeper you go into the band, the faster it goes; beyond that, it plateaus. */
function rampSpeed(depth: number): number {
  return Math.max(2, Math.min(MAX_SPEED, (depth / EDGE) * MAX_SPEED));
}

/** Scrolling speed for a pointer at `pos` between two edges. */
function edgeVelocity(pos: number, min: number, max: number): number {
  // Under two high bands, the two edges step on each other: we give up.
  if (max - min < EDGE * 2) return 0;
  if (pos < min + EDGE) return -rampSpeed(min + EDGE - pos);
  if (pos > max - EDGE) return rampSpeed(pos - (max - EDGE));
  return 0;
}

/** The column (or other scrolling box) under this point, inside the board. */
function scrollableAt(
  x: number,
  y: number,
  root: HTMLElement
): HTMLElement | null {
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof HTMLElement) || !root.contains(hit)) return null;
  let node: HTMLElement | null = hit;
  while (node) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") return node;
    }
    if (node === root) return null;
    node = node.parentElement;
  }
  return null;
}

function sameIds(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export interface MarqueeSelection<T extends HTMLElement> {
  /** To be merged with the other refs of the scrolling container of the board. */
  ref: RefCallback<T>;
  /** To place on this same container. */
  onPointerDown: (event: ReactPointerEvent<T>) => void;
  /** To pass to <MarqueeOverlay/>, rendered anywhere in the tree. */
  overlayRef: RefObject<HTMLDivElement | null>;
}

export function useMarqueeSelection<T extends HTMLElement = HTMLElement>({
  selected,
  onChange,
}: {
  /** The current selection — serves as the basis for an additive gesture (⇧ or ⌘). */
  selected: Set<string>;
  /** Receives the full selection, never a delta. */
  onChange: (next: Set<string>) => void;
}): MarqueeSelection<T> {
  const containerRef = useRef<T | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // A gesture in progress must not survive the board (change of view,
  // project) — listeners cut off, and the body returned to its text selection.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      document.body.style.userSelect = "";
    },
    []
  );

  const ref = useCallback<RefCallback<T>>((el) => {
    containerRef.current = el;
  }, []);

  const onPointerDown = (event: ReactPointerEvent<T>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(IGNORE_SELECTOR)) return;
    // A classic scrollbar (Windows, Linux) is in the frame but
    // is not from the bottom: without that, catching it would throw a lasso instead of making
    // scroll the board. Under macOS it floats and these two margins are worth zero.
    const bounds = container.getBoundingClientRect();
    if (
      event.clientX > bounds.right - (container.offsetWidth - container.clientWidth) ||
      event.clientY > bounds.bottom - (container.offsetHeight - container.clientHeight)
    ) {
      return;
    }
    // Sharp cut text selection and image drag from browser.
    event.preventDefault();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const baseline = new Set(selected);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const clippers = new Map<HTMLElement, HTMLElement[]>();
    const anchorScroller = scrollableAt(
      event.clientX,
      event.clientY,
      container
    );
    /** The scrollable box below the pointer, maintained by `pointermove`. */
    let pointerScroller: HTMLElement | null = anchorScroller;
    let anchorX = event.clientX;
    let anchorY = event.clientY;
    let pointerX = anchorX;
    let pointerY = anchorY;
    let started = false;
    let dirty = false;
    let frame: number | null = null;
    let emitted = new Set(selected);

    const emit = (next: Set<string>) => {
      if (sameIds(next, emitted)) return;
      emitted = next;
      onChangeRef.current(next);
    };

    const apply = () => {
      const containerBox = rectOf(container);
      // The lasso does not extend beyond the board: we only select what it shows.
      const box = intersect(
        {
          left: Math.min(anchorX, pointerX),
          right: Math.max(anchorX, pointerX),
          top: Math.min(anchorY, pointerY),
          bottom: Math.max(anchorY, pointerY),
        },
        containerBox
      );

      // ⚠ **READ BEFORE WRITING** (MIN-320). The overlay styles were
      // placed first, then came the N `getBoundingClientRect()` of the
      // cards: the exact opposite order of that which avoids a reflow. THE
      // measurements first, writing second — only one layout per image.
      const touched = new Set<string>();
      if (box) {
        for (const el of container.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
          const id = el.dataset.issueId;
          if (!id) continue;
          const rect = visibleRect(el, container, clippers);
          if (rect && overlaps(rect, box)) touched.add(id);
        }
      }

      const overlay = overlayRef.current;
      if (overlay) {
        if (box) {
          overlay.style.display = "block";
          overlay.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
          overlay.style.width = `${box.right - box.left}px`;
          overlay.style.height = `${box.bottom - box.top}px`;
        } else {
          overlay.style.display = "none";
        }
      }

      emit(additive ? new Set([...baseline, ...touched]) : touched);
    };

    /**
     * Automatic scrolling at edges, READING THEN WRITING (MIN-320).
     *
     * The previous version alternated: reading rect → writing `scrollLeft`
     * → reread → `document.elementFromPoint` (which forces an update of
     * style AND layout, since a write has just invalidated them) → raised
     * ancestors with `getComputedStyle().overflowY` and readings of
     * `scrollHeight`/`clientHeight` per level → writing of `scrollTop`. Two to
     * three forced layouts per image, including stationary pointer, throughout the
     * geste.
     *
     * What remains here is a reading phase and then a writing phase. There
     * resolution of the scroller under the pointer, she left the loop: she
     * can only change when the pointer moves, so it lives in its
     * gestionnaire (`pointerScroller`).
     */
    const autoScroll = () => {
      const containerBox = rectOf(container);
      const dx = edgeVelocity(pointerX, containerBox.left, containerBox.right);

      // The cursor may have come off the board: we then continue to do
      // scroll down the column you started from, which is the intention.
      const scroller = pointerScroller ?? anchorScroller;
      const scrollerBox = scroller ? rectOf(scroller) : null;
      const dy = scrollerBox
        ? edgeVelocity(pointerY, scrollerBox.top, scrollerBox.bottom)
        : 0;

      if (dx === 0 && dy === 0) return;

      if (dx !== 0) {
        const before = container.scrollLeft;
        container.scrollLeft = before + dx;
        const applied = container.scrollLeft - before;
        if (applied !== 0) {
          anchorX -= applied;
          dirty = true;
        }
      }
      if (dy !== 0 && scroller) {
        const before = scroller.scrollTop;
        scroller.scrollTop = before + dy;
        const applied = scroller.scrollTop - before;
        if (applied !== 0) {
          if (scroller === anchorScroller) anchorY -= applied;
          dirty = true;
        }
      }
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      autoScroll();
      if (!dirty) return;
      dirty = false;
      apply();
    };

    const finish = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      document.body.style.userSelect = "";
      const overlay = overlayRef.current;
      if (overlay) overlay.style.display = "none";
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };

    window.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        pointerX = e.clientX;
        pointerY = e.clientY;
        // The scrollable box below the pointer is resolved HERE and not in the
        // loop (MIN-320): it can change only when the pointer moves,
        // and its resolution costs a `elementFromPoint` plus an escalation
        // of ancestors in `getComputedStyle` — that is to say a forced layout, which
        // otherwise fell at every frame, including stationary pointer.
        pointerScroller = scrollableAt(pointerX, pointerY, container);
        if (!started) {
          if (Math.hypot(pointerX - anchorX, pointerY - anchorY) < START_DISTANCE) {
            return;
          }
          started = true;
          document.body.style.userSelect = "none";
          loop();
        }
        dirty = true;
      },
      { signal }
    );

    const stop = () => {
      const dragged = started;
      finish();
      // A clear click on the bottom, without sliding: we close the selection — it was
      // so far the pill cross, at the other end of the screen.
      if (!dragged && !additive && baseline.size > 0) {
        onChangeRef.current(new Set());
      }
    };
    window.addEventListener("pointerup", stop, { signal });
    window.addEventListener("pointercancel", stop, { signal });
    // Release out of the window, ⌘-tab in the middle of the gesture: we won't see
    // never the `pointerup`. We keep the acquired selection, we let go of the rest.
    window.addEventListener("blur", finish, { signal });

    window.addEventListener(
      "keydown",
      (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        finish();
        emit(baseline);
      },
      { signal }
    );

    // Wheel during the gesture: the cards move, the rectangle does not — you must
    // redo the calculation. `capture` because a column scroll does not go up.
    window.addEventListener(
      "scroll",
      () => {
        dirty = true;
      },
      { signal, capture: true, passive: true }
    );
  };

  return { ref, onPointerDown, overlayRef };
}

/**
 * The rectangle itself. Masked and positioned by hand by the hook (see its
 * header): this component only renders once and does not react to anything.
 */
export function MarqueeOverlay({
  overlayRef,
}: {
  overlayRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={overlayRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-30 hidden rounded-[3px] border border-primary/70 bg-primary/15"
    />
  );
}
