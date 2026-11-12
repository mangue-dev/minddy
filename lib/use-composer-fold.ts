"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * One row or a card, for a comment composer: like Numo's composer
 * (components/assistant/chat-input.tsx), the field starts as a single row,
 * text and controls side by side, and gives the text its own row above the
 * controls as soon as it wraps or holds several blocks. It folds back only
 * once its single line fits the row again, so it never flips at the
 * boundary.
 *
 * `textRef` holds the editor; `controlRefs` the controls that share the row
 * with it. `forceExpanded` keeps the card (attachments pending above the
 * text). An empty field always folds: its placeholder is one short word.
 */
/** Pixels the line must leave free in the row before the card folds back. */
const FOLD_MARGIN = 6;

/**
 * Whether the text needs its own row, from what was measured. In the row it
 * wraps as soon as it takes a second line. In the card it stays while it has
 * several blocks or its single line would not fit the row with a few pixels
 * to spare: without that margin a line at the very edge of the row folds,
 * wraps again in the row and unfolds, over and over.
 */
export function composerWraps({
  expanded,
  blocks,
  multiLine,
  lineWidth,
  rowRoom,
}: {
  expanded: boolean;
  /** Block elements in the editor (paragraphs, lists, quotes). */
  blocks: number;
  /** The text takes more than one line where it is now. */
  multiLine: boolean;
  /** Width of the single line's inline content, measured in the card. */
  lineWidth: number;
  /** Room the text would get back in the row. */
  rowRoom: number;
}): boolean {
  if (!expanded) return multiLine;
  if (blocks !== 1) return true;
  // No inline content to measure (an image, a rule): its height decides.
  if (lineWidth === 0) return multiLine;
  return lineWidth > rowRoom - FOLD_MARGIN;
}

export function useComposerFold({
  gridRef,
  textRef,
  controlRefs,
  value,
  forceExpanded = false,
}: {
  gridRef: RefObject<HTMLElement | null>;
  textRef: RefObject<HTMLElement | null>;
  controlRefs: ReadonlyArray<RefObject<HTMLElement | null>>;
  /** The draft: re-measured on every change, since shortening a line that
   *  stays on one line does not resize anything. */
  value: string;
  forceExpanded?: boolean;
}): boolean {
  const [wraps, setWraps] = useState(false);
  const expanded = forceExpanded || wraps;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const empty = value.trim() === "";
  const emptyRef = useRef(empty);
  emptyRef.current = empty;
  // What the single row takes from the grid's width besides the text and the
  // controls (paddings and gaps), measured while it is a row: folding back
  // compares the text with exactly the room it would get.
  const rowGapsRef = useRef<number | null>(null);
  const controlRefsRef = useRef(controlRefs);
  controlRefsRef.current = controlRefs;

  const measure = useCallback(() => {
    const grid = gridRef.current;
    const text = textRef.current;
    const editor = text?.querySelector<HTMLElement>("[contenteditable]");
    // A hidden composer (a closed panel) has nothing to measure.
    if (!grid || !text || !editor || grid.clientWidth === 0) return;
    if (emptyRef.current) {
      setWraps(false);
      return;
    }
    const controls = controlRefsRef.current.reduce(
      (sum, ref) => sum + (ref.current?.offsetWidth ?? 0),
      0,
    );
    const blocks = editor.children;
    const first = blocks[0] as HTMLElement | undefined;
    const lineHeight = parseFloat(getComputedStyle(first ?? editor).lineHeight) || 22;
    const multiLine = blocks.length > 1 || (first?.offsetHeight ?? 0) > lineHeight * 1.5;
    if (!expandedRef.current) {
      // The editor's own width: wherever the caller puts the paddings
      // (around the editor or on its content), this is the line's room.
      const style = getComputedStyle(editor);
      const textRoom =
        editor.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      rowGapsRef.current = grid.clientWidth - textRoom - controls;
    }
    let lineWidth = 0;
    if (expandedRef.current && blocks.length === 1 && first) {
      // The width of the line's own content (its text and inline pills), not
      // of the block, which spans the field.
      const range = document.createRange();
      range.selectNodeContents(first);
      lineWidth = range.getBoundingClientRect().width;
    }
    setWraps(
      composerWraps({
        expanded: expandedRef.current,
        blocks: blocks.length,
        multiLine,
        lineWidth,
        rowRoom: grid.clientWidth - controls - (rowGapsRef.current ?? 32),
      }),
    );
  }, [gridRef, textRef]);

  useEffect(() => {
    const grid = gridRef.current;
    const text = textRef.current;
    if (!grid || !text) return;
    // The editor loads lazily and resizes as text is filled or cleared from
    // outside (dictation, a quote, a send); the controls change width on
    // their own (the send button appears with the first letter).
    const observer = new ResizeObserver(() => measure());
    observer.observe(grid);
    observer.observe(text);
    for (const ref of controlRefsRef.current) if (ref.current) observer.observe(ref.current);
    const watchEditor = () => {
      const editor = text.querySelector("[contenteditable]");
      if (!editor) return false;
      observer.observe(editor);
      return true;
    };
    const editorWatch = new MutationObserver(() => {
      if (watchEditor()) editorWatch.disconnect();
    });
    if (!watchEditor()) editorWatch.observe(text, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      editorWatch.disconnect();
    };
  }, [gridRef, textRef, measure]);

  useLayoutEffect(() => {
    measure();
  }, [value, expanded, measure]);

  return expanded;
}
