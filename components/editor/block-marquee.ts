"use client";

// The selection rectangle of pages and the task notebook, as on the boards
// (components/marquee-selection.tsx) and in Notion: press beside the text —
// in the gutter, in the pane around the column, under the last block — and
// drag. Every block the rectangle overlaps — a first-level block, or a list
// item, as in the gutter — becomes one block selection (block-selection.ts), so the selection card, the block menu,
// copy and delete act on them as on any block selection.
//
// - Where it starts follows margin-caret.ts: on an element that contains
//   the editor (the column, the pane), on the editor's own bands beside its
//   text, or on the empty reserve under the document — never on text, a
//   field, a button or a link, which keep their own press.
// - A press that does not move stays a click: beside a line it puts the
//   caret on that line, as margin-caret.ts does, elsewhere it only takes the
//   focus out of a field.
// - The rectangle is drawn straight into its element's style, measured from
//   the screen; the pane scrolls under it near its top and bottom edges, and
//   its anchor moves with the content. Escape restores the selection the
//   press found.
// - Mouse only: with a finger the same gesture scrolls.

import type { Editor } from "@tiptap/react";
import { TextSelection, type Selection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useEffect, type RefObject } from "react";
import { BlockSelection } from "@/components/editor/block-selection";
import { lineEdge } from "@/components/editor/margin-caret";
import { scrollPane } from "@/lib/scroll-pane";
import { MARQUEE_DRAWING_CLASS } from "@/components/marquee-drawing";

/** Below this distance the press stays a click. */
const START_DISTANCE = 5;
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_STEP = 14;

/** The rectangle's element, styled in app/globals.css. */
export const BLOCK_MARQUEE_CLASS = "block-marquee";
/** The empty space under a document that a press may start from. */
export const EDITOR_RESERVE_ATTR = "data-editor-reserve";

/** What keeps its own press. */
const OWN_PRESS =
  'button, a, input, textarea, select, label, [role="button"], [contenteditable="true"], [data-floating-surface]';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** The editor's text column: its box without the gutter bands. */
function textBox(dom: HTMLElement): DOMRect {
  const rect = dom.getBoundingClientRect();
  const style = getComputedStyle(dom);
  const left = rect.left + (parseFloat(style.paddingLeft) || 0);
  const right = rect.right - (parseFloat(style.paddingRight) || 0);
  return new DOMRect(left, rect.top, right - left, rect.height);
}

/** Whether a press on `target` may start the rectangle. */
export function startsMarquee(
  target: EventTarget | null,
  x: number,
  root: HTMLElement,
  dom: HTMLElement
): boolean {
  if (!(target instanceof Element)) return false;
  // The editor itself: only its bands beside the text, where ProseMirror
  // would otherwise begin a text selection.
  if (target === dom) {
    const text = textBox(dom);
    return x < text.left || x > text.right;
  }
  if (dom.contains(target)) return false;
  if (target.closest(`[${EDITOR_RESERVE_ATTR}]`) && root.contains(target)) return true;
  if (target.closest(OWN_PRESS)) return false;
  return target.contains(root);
}

/** A list is no block of its own: the rectangle reaches its items, as the
    gutter does (components/pages/block-gutter.tsx), which gives each item
    its own handle. */
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
const LIST_ITEM_TYPES = new Set(["listItem", "taskItem"]);

/**
 * The starts of the blocks a rectangle overlaps, in document order: the
 * first-level blocks, and inside a list each item — at any depth — rather
 * than the whole list. An item is reached through its own content, not
 * through the nested list it holds: a rectangle over a sub-item alone does
 * not take its parent with it. `rectOf` measures the node starting at a
 * position.
 */
export function blocksInBox(
  doc: PMNode,
  rectOf: (pos: number) => DOMRect | null,
  box: Box
): number[] {
  const found: number[] = [];
  const hit = (pos: number) => {
    const rect = rectOf(pos);
    return !!rect && overlaps(rect, box);
  };
  const visit = (node: PMNode, pos: number) => {
    if (LIST_TYPES.has(node.type.name)) {
      node.forEach((child, offset) => visit(child, pos + 1 + offset));
      return;
    }
    if (LIST_ITEM_TYPES.has(node.type.name)) {
      let own = false;
      const nested: [PMNode, number][] = [];
      node.forEach((child, offset) => {
        const childPos = pos + 1 + offset;
        if (LIST_TYPES.has(child.type.name)) nested.push([child, childPos]);
        else if (!own && hit(childPos)) own = true;
      });
      if (own) found.push(pos);
      for (const [child, childPos] of nested) visit(child, childPos);
      return;
    }
    if (hit(pos)) found.push(pos);
  };
  doc.forEach((node, offset) => visit(node, offset));
  return found;
}

/** The blocks a rectangle overlaps, as a block selection whose anchor is the
    block nearest where the gesture started. Items of one list select only
    those items; a range that also reaches past the list takes it whole, as
    a selection holds sibling blocks (block-selection.ts). */
function blocksIn(editor: Editor, box: Box, upward: boolean): BlockSelection | null {
  const { view } = editor;
  const found = blocksInBox(
    view.state.doc,
    (pos) => {
      const dom = view.nodeDOM(pos);
      return dom instanceof HTMLElement ? dom.getBoundingClientRect() : null;
    },
    box
  );
  const first = found[0];
  const last = found[found.length - 1];
  if (first === undefined || last === undefined) return null;
  return upward
    ? BlockSelection.create(view.state.doc, last, first)
    : BlockSelection.create(view.state.doc, first, last);
}

/** A click that did not become a rectangle: the caret on the line beside it,
    or, away from the text, only the focus out of a field. */
function click(editor: Editor, x: number, y: number) {
  const { view } = editor;
  const text = textBox(view.dom);
  if (y >= text.top && y <= text.bottom && (x < text.left || x > text.right)) {
    const pos = lineEdge(view, text, y, x < text.left ? "start" : "end");
    if (pos !== null) {
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))));
      view.focus();
      return;
    }
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && !view.dom.contains(active)) active.blur();
}

/** Starts tracking a press that may become a selection rectangle. */
function trackMarquee(editor: Editor, pane: HTMLElement, start: MouseEvent) {
  const { view } = editor;
  const initial: Selection = view.state.selection;
  const scroller = pane === document.body ? document.scrollingElement ?? document.documentElement : pane;
  // A scrolling document fires its scroll events at the window, never at the body.
  const scrollEvents: EventTarget = pane === document.body ? window : pane;
  let anchorX = start.clientX;
  let anchorY = start.clientY;
  let pointerX = anchorX;
  let pointerY = anchorY;
  let started = false;
  let focused = false;
  let overlay: HTMLElement | null = null;
  let frame = 0;

  const apply = () => {
    const box: Box = {
      left: Math.min(anchorX, pointerX),
      right: Math.max(anchorX, pointerX),
      top: Math.min(anchorY, pointerY),
      bottom: Math.max(anchorY, pointerY),
    };
    if (view.isDestroyed) return;
    // Measure the blocks first, write the rectangle second: one layout.
    const next = blocksIn(editor, box, pointerY < anchorY);
    if (overlay) {
      overlay.style.transform = `translate(${Math.round(box.left)}px, ${Math.round(box.top)}px)`;
      overlay.style.width = `${Math.round(box.right - box.left)}px`;
      overlay.style.height = `${Math.round(box.bottom - box.top)}px`;
    }
    const current = view.state.selection;
    if (next) {
      if (!next.eq(current)) view.dispatch(view.state.tr.setSelection(next));
      if (!focused) {
        focused = true;
        view.focus();
      }
    } else if (current instanceof BlockSelection && !initial.eq(current)) {
      restore();
    }
  };

  // The selection the press found, unless the document changed under it
  // (a collaborator's edit): then the blocks are only let go.
  const restore = () => {
    if (view.isDestroyed) return;
    const selection = view.state.doc.eq(initial.$anchor.doc) ? initial : TextSelection.near(view.state.doc.resolve(0));
    view.dispatch(view.state.tr.setSelection(selection));
  };

  // Near the pane's edges the content scrolls under the pointer; the anchor
  // is a point of the content, so it moves with it.
  const autoscroll = () => {
    frame = 0;
    if (!started) return;
    const bounds = pane === document.body ? { top: 0, bottom: window.innerHeight } : pane.getBoundingClientRect();
    const step =
      pointerY < bounds.top + AUTOSCROLL_EDGE ? -AUTOSCROLL_STEP
        : pointerY > bounds.bottom - AUTOSCROLL_EDGE ? AUTOSCROLL_STEP
          : 0;
    if (!step) return;
    const before = scroller.scrollTop;
    scroller.scrollTop = before + step;
    anchorY -= scroller.scrollTop - before;
    apply();
    frame = requestAnimationFrame(autoscroll);
  };

  const onMove = (event: MouseEvent) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!started) {
      if (Math.hypot(pointerX - anchorX, pointerY - anchorY) < START_DISTANCE) return;
      started = true;
      document.body.style.userSelect = "none";
      document.documentElement.classList.add(MARQUEE_DRAWING_CLASS);
      overlay = document.createElement("div");
      overlay.className = BLOCK_MARQUEE_CLASS;
      document.body.appendChild(overlay);
    }
    event.preventDefault();
    apply();
    if (!frame) frame = requestAnimationFrame(autoscroll);
  };

  // A wheel during the gesture moves the blocks under a still rectangle.
  let lastScroll = scroller.scrollTop;
  const onScroll = () => {
    const delta = scroller.scrollTop - lastScroll;
    lastScroll = scroller.scrollTop;
    if (!started || frame) return;
    anchorY -= delta;
    apply();
  };

  const finish = () => {
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", finish);
    scrollEvents.removeEventListener("scroll", onScroll);
    if (frame) cancelAnimationFrame(frame);
    overlay?.remove();
    document.body.style.userSelect = "";
    document.documentElement.classList.remove(MARQUEE_DRAWING_CLASS);
  };

  const onUp = () => {
    finish();
    if (!started && !view.isDestroyed) click(editor, start.clientX, start.clientY);
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !started) return;
    event.preventDefault();
    event.stopPropagation();
    finish();
    restore();
  };

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  window.addEventListener("keydown", onKey, true);
  // Released outside the window: no mouseup will come.
  window.addEventListener("blur", finish);
  scrollEvents.addEventListener("scroll", onScroll, { passive: true });
}

/** The selection rectangle around an editor mounted in `rootRef`. */
export function useBlockMarquee(
  editor: Editor | null,
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!editor || !root || !enabled) return;
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const pane = scrollPane(root);
    let touch = false;
    const onPointerDown = (event: PointerEvent) => {
      touch = event.pointerType !== "mouse";
    };
    const onDown = (event: MouseEvent) => {
      if (touch || event.button !== 0 || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (editor.isDestroyed || !editor.isEditable) return;
      if (!startsMarquee(event.target, event.clientX, root, editor.view.dom)) return;
      // Before ProseMirror and the margin caret, which would start a text
      // selection or move the caret: both skip a press already handled, and
      // a click comes back to them through `click` above.
      event.preventDefault();
      trackMarquee(editor, pane, event);
    };
    // Capture: the press is claimed before the editor and the pane see it.
    pane.addEventListener("pointerdown", onPointerDown, true);
    pane.addEventListener("mousedown", onDown, true);
    return () => {
      pane.removeEventListener("pointerdown", onPointerDown, true);
      pane.removeEventListener("mousedown", onDown, true);
    };
  }, [editor, rootRef, enabled]);
}
