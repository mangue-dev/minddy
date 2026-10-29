"use client";

// Clicking the empty margin beside an editor puts the caret on the line at
// that height, the way a word processor's page does: a document column sits
// in a wider pane, and the space on either side of its text reads as part of
// the page, not as dead space. The margin also shows a text cursor.
//
// "The margin" is precise: the pointer is in the editor's vertical band but
// beside its text, on an element that CONTAINS the editor (the column, the
// pane, the scroll container). A title, a property row or a button beside the
// text is not an ancestor of the editor, so it keeps its own click.

import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { useEffect, type RefObject } from "react";
import { scrollPane } from "@/lib/scroll-pane";

/** Editors whose margin is under the pointer, per pane: two editors may share
    a pane, and one leaving its band must not clear the other's cursor. */
const cursorOwners = new WeakMap<HTMLElement, Set<Editor>>();

function showTextCursor(pane: HTMLElement, editor: Editor, shown: boolean) {
  const owners = cursorOwners.get(pane) ?? new Set<Editor>();
  cursorOwners.set(pane, owners);
  if (shown) owners.add(editor);
  else owners.delete(editor);
  pane.style.cursor = owners.size > 0 ? "text" : "";
}

/** The text area's rectangle when `event` falls in a margin beside it. */
function marginHit(
  event: MouseEvent,
  root: HTMLElement,
  editor: Editor
): DOMRect | null {
  if (editor.isDestroyed || !editor.isEditable) return null;
  const target = event.target;
  if (!(target instanceof Element) || !target.contains(root)) return null;
  const rect = editor.view.dom.getBoundingClientRect();
  const { clientX: x, clientY: y } = event;
  if (y < rect.top || y > rect.bottom) return null;
  if (x >= rect.left && x <= rect.right) return null;
  return rect;
}

/** Past this many characters, a paragraph is not walked for its line. */
const MAX_WALK = 5000;

/**
 * The start or end of the visual line at height `y`. Aiming `posAtCoords`
 * just inside the text's right edge is not enough: beside a short line, a
 * heading or a list item, that point falls in the block's empty box, and
 * ProseMirror answers with the position BEFORE the block — the caret jumped
 * to the line's start. The textblock is found from its left edge instead,
 * and the line's end is the last of its positions drawn at that height.
 */
export function lineEdge(
  view: Editor["view"],
  rect: DOMRect,
  y: number,
  side: "start" | "end"
): number | null {
  const probe =
    view.posAtCoords({ left: rect.left + 1, top: y }) ??
    view.posAtCoords({ left: rect.right - 1, top: y });
  if (!probe) return null;
  const $probe = view.state.doc.resolve(probe.pos);
  const $text = $probe.parent.isTextblock
    ? $probe
    : view.state.doc.resolve(TextSelection.near($probe).from);
  if (!$text.parent.isTextblock) return probe.pos;
  const start = $text.start();
  const end = $text.end();
  if (end - start > MAX_WALK) return side === "start" ? start : end;
  let first: number | null = null;
  let last: number | null = null;
  for (let pos = start; pos <= end; pos++) {
    const { top, bottom } = view.coordsAtPos(pos);
    if (y >= top - 1 && y <= bottom + 1) {
      first ??= pos;
      last = pos;
    } else if (last !== null) break;
  }
  // Between two lines (a block's margin): the block's own edge.
  if (side === "start") return first ?? start;
  return last ?? end;
}

export function useMarginCaret(
  editor: Editor | null,
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!editor || !root || !enabled) return;
    // A touch screen has no hover cursor, and a tap beside a narrow column
    // is more often a scroll than an aim.
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const pane = scrollPane(root);
    let shown = false;

    const onMove = (event: MouseEvent) => {
      const hit = event.buttons === 0 && marginHit(event, root, editor) !== null;
      if (hit === shown) return;
      shown = hit;
      showTextCursor(pane, editor, hit);
    };
    const onLeave = () => {
      if (!shown) return;
      shown = false;
      showTextCursor(pane, editor, false);
    };
    const onDown = (event: MouseEvent) => {
      // Two editors may share a pane; the first one in its band answers.
      if (event.button !== 0 || event.defaultPrevented) return;
      const rect = marginHit(event, root, editor);
      if (!rect) return;
      const { view } = editor;
      const pos = lineEdge(view, rect, event.clientY, event.clientX < rect.left ? "start" : "end");
      if (pos === null) return;
      // `mousedown` with `preventDefault`: otherwise the browser first drops
      // the caret where it likes (the pane is not editable) and it jumps.
      event.preventDefault();
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))));
      view.focus();
    };

    pane.addEventListener("mousemove", onMove);
    pane.addEventListener("mouseleave", onLeave);
    pane.addEventListener("mousedown", onDown);
    return () => {
      pane.removeEventListener("mousemove", onMove);
      pane.removeEventListener("mouseleave", onLeave);
      pane.removeEventListener("mousedown", onDown);
      if (shown) showTextCursor(pane, editor, false);
    };
  }, [editor, rootRef, enabled]);
}
