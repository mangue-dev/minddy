"use client";

// Moving blocks by their handle, driven by the pointer rather than by the
// browser's native drag and drop.
//
// A native drag hands the cursor to the browser: whatever the page asks for,
// it shows its own (the text cursor over an editable document), so the grab
// cursor a handle promises could never appear. Here the page keeps the
// pointer: the cursor stays "grabbing" for the whole gesture, a translucent
// copy of the blocks follows it, a line shows where they will land, and the
// pane scrolls when the pointer nears its top or bottom edge.
//
// The blocks move at the level the handle carries them: first-level blocks
// between first-level blocks, list items between the items of any list that
// takes them (a bullet into a numbered list, a task among tasks), nested
// lists included. The move is one transaction — the blocks deleted, then
// inserted at the mapped target — so undo, collaboration and autosave see an
// ordinary edit, and the blocks keep their ids.

import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { blockRange, selectBlockFromHandle } from "@/components/pages/block-actions";
import { BlockSelection } from "@/components/editor/block-selection";
import { scrollPane } from "@/lib/scroll-pane";

/** How far the pointer travels before a press on the handle becomes a drag. */
const DRAG_THRESHOLD = 4;
/** The band at a pane's top and bottom edge that scrolls it during a drag. */
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_STEP = 14;

/** The class on <html> while a block is dragged: the grab cursor everywhere. */
export const BLOCK_DRAGGING_CLASS = "block-dragging";

interface DropTarget {
  /** Document position between two blocks of the dragged level. */
  pos: number;
  /** Where the drop line is drawn, in viewport coordinates. */
  y: number;
  /** The drop line's left edge, for an item drawn at its list's indentation. */
  left?: number;
}

/**
 * The item boundary below the pointer, among the lists that take `itemType`.
 * Every boundary, read in document order, carries the height that decides it:
 * before an item, its first line's middle (a pointer over its nested items
 * goes on past it); after a list's last item, the list's bottom. The first
 * boundary whose height is below the pointer wins; these heights only grow
 * in document order, nested lists included.
 */
function itemDropTarget(editor: Editor, itemType: string, y: number): DropTarget | null {
  const { doc, schema } = editor.state;
  const item = schema.nodes[itemType];
  if (!item) return null;
  const candidates: Array<DropTarget & { decide: number }> = [];
  const visit = (node: PMNode, pos: number) => {
    if (node.isTextblock || node.isAtom) return;
    const list = node.childCount > 0 && node.firstChild?.type === item;
    const listDom = list ? editor.view.nodeDOM(pos) : null;
    let offset = pos + 1;
    node.forEach((child) => {
      if (list && child.type === item) {
        const itemDom = editor.view.nodeDOM(offset);
        if (itemDom instanceof HTMLElement) {
          const line = (itemDom.firstElementChild as HTMLElement | null) ?? itemDom;
          const box = line.getBoundingClientRect();
          const rect = itemDom.getBoundingClientRect();
          candidates.push({ pos: offset, y: rect.top, left: rect.left, decide: box.top + box.height / 2 });
        }
      }
      visit(child, offset);
      offset += child.nodeSize;
    });
    if (list && listDom instanceof HTMLElement) {
      const rect = listDom.getBoundingClientRect();
      candidates.push({ pos: pos + node.nodeSize - 1, y: rect.bottom, left: rect.left, decide: rect.bottom });
    }
  };
  doc.forEach((node, offset) => visit(node, offset));
  const found = candidates.find((candidate) => y < candidate.decide) ?? candidates.at(-1);
  return found ? { pos: found.pos, y: found.y, left: found.left } : null;
}

/** The boundary of the dragged level nearest the pointer's height. */
function dropTarget(editor: Editor, y: number, itemType: string | null): DropTarget | null {
  if (itemType) return itemDropTarget(editor, itemType, y);
  const { doc } = editor.state;
  let target: DropTarget | null = null;
  let last: DOMRect | null = null;
  doc.forEach((node, offset) => {
    if (target) return;
    const dom = editor.view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) target = { pos: offset, y: rect.top };
    last = rect;
  });
  if (target) return target;
  const end = last as DOMRect | null;
  return end ? { pos: doc.content.size, y: end.bottom } : null;
}

/**
 * Starts tracking a press on the handle of the block at `pos`. Below the
 * threshold nothing happens, and the press stays a click (the handle's menu).
 * `onDragChange` reports when a drag starts and ends.
 */
export function trackBlockDrag(
  editor: Editor,
  pos: number,
  start: MouseEvent,
  onDragChange: (dragging: boolean) => void
): void {
  const startX = start.clientX;
  const startY = start.clientY;
  let dragging = false;
  let range: { from: number; to: number } | null = null;
  let ghost: HTMLElement | null = null;
  let line: HTMLElement | null = null;
  let target: DropTarget | null = null;
  // Set when list items are dragged: they land among items of that type.
  let itemType: string | null = null;
  let pointerY = startY;
  let scrollFrame = 0;
  // Dragging over its first pixels must not also start a click on the handle.
  let suppressClick = false;

  const pane = scrollPane(editor.view.dom);
  const text = () => editor.view.dom.getBoundingClientRect();

  const begin = () => {
    if (!selectBlockFromHandle(editor, pos, false)) return false;
    range = blockRange(editor);
    if (!range) return false;
    const level = editor.state.doc.resolve(range.from).parent;
    const first = level.firstChild?.type.name;
    itemType = level !== editor.state.doc && (first === "listItem" || first === "taskItem") ? first : null;
    dragging = true;
    suppressClick = true;
    document.documentElement.classList.add(BLOCK_DRAGGING_CLASS);
    editor.commands.setMeta("lockDragHandle", true);

    // The copy that follows the pointer: the dragged blocks as they render.
    ghost = document.createElement("div");
    ghost.className = "block-drag-ghost";
    const firstDom = editor.view.nodeDOM(range.from);
    const width = firstDom instanceof HTMLElement ? firstDom.getBoundingClientRect().width : 320;
    ghost.style.width = `${Math.round(width)}px`;
    editor.state.doc.nodesBetween(range.from, range.to, (_node, at, parent) => {
      if (parent !== level) return true;
      const dom = editor.view.nodeDOM(at);
      if (dom instanceof HTMLElement) ghost?.appendChild(dom.cloneNode(true));
      return false;
    });
    document.body.appendChild(ghost);

    line = document.createElement("div");
    line.className = "block-drag-line";
    document.body.appendChild(line);
    onDragChange(true);
    return true;
  };

  const place = (x: number, y: number) => {
    if (ghost) ghost.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y + 8)}px)`;
    target = dropTarget(editor, y, itemType);
    if (!line || !target) return;
    const box = text();
    const style = getComputedStyle(editor.view.dom);
    const left = target.left ?? box.left + (parseFloat(style.paddingLeft) || 0);
    const right = box.right - (parseFloat(style.paddingRight) || 0);
    line.style.transform = `translate(${Math.round(left)}px, ${Math.round(target.y - 1)}px)`;
    line.style.width = `${Math.round(right - left)}px`;
  };

  // Near the pane's edges the document scrolls under the pointer, which
  // keeps the drop target moving with it.
  const autoscroll = () => {
    scrollFrame = 0;
    if (!dragging) return;
    const box = pane === document.body ? { top: 0, bottom: window.innerHeight } : pane.getBoundingClientRect();
    const step =
      pointerY < box.top + AUTOSCROLL_EDGE ? -AUTOSCROLL_STEP
        : pointerY > box.bottom - AUTOSCROLL_EDGE ? AUTOSCROLL_STEP
          : 0;
    if (!step) return;
    (pane === document.body ? document.scrollingElement ?? document.documentElement : pane).scrollBy(0, step);
    place(lastX, pointerY);
    scrollFrame = requestAnimationFrame(autoscroll);
  };
  let lastX = startX;

  const onMove = (event: MouseEvent) => {
    lastX = event.clientX;
    pointerY = event.clientY;
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return;
      if (!begin()) return finish();
    }
    event.preventDefault();
    place(event.clientX, event.clientY);
    if (!scrollFrame) scrollFrame = requestAnimationFrame(autoscroll);
  };

  const drop = () => {
    if (!range || !target || editor.isDestroyed) return;
    const { from, to } = range;
    // Onto itself: nothing moves.
    if (target.pos >= from && target.pos <= to) return;
    const { state } = editor;
    const content = state.doc.slice(from, to).content;
    // Moving out every item of a list removes the list it leaves empty.
    const tr = itemType ? state.tr.deleteRange(from, to) : state.tr.delete(from, to);
    const at = tr.mapping.map(target.pos);
    tr.insert(at, content);
    // The moved blocks stay selected as blocks, as after the handle's other
    // gestures: from the first moved block to the start of the last one.
    const last = content.lastChild;
    tr.setSelection(BlockSelection.create(tr.doc, at, at + content.size - (last?.nodeSize ?? 0)));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };

  const finish = () => {
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    ghost?.remove();
    line?.remove();
    if (dragging) {
      document.documentElement.classList.remove(BLOCK_DRAGGING_CLASS);
      if (!editor.isDestroyed) editor.commands.setMeta("lockDragHandle", false);
      onDragChange(false);
    }
    if (suppressClick) {
      // The click that follows this mouseup would open the handle's menu. It
      // is dispatched in the same task, so the guard goes right after it.
      const swallow = (event: MouseEvent) => event.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
    }
  };

  const onUp = () => {
    if (dragging) drop();
    finish();
  };

  // Escape cancels the drag without moving anything.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !dragging) return;
    event.preventDefault();
    // The editor's own Escape would otherwise clear the block selection.
    event.stopPropagation();
    target = null;
    finish();
  };

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  window.addEventListener("keydown", onKey, true);
}
