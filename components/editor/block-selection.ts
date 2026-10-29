// BLOCK SELECTION, the way Notion does it, on every surface the editor engine
// mounts (pages, the notebook, descriptions, comments).
//
// - A drag that stays in one block selects text. As soon as it reaches another
//   block (or starts in the margin beside the text), it selects whole blocks:
//   each one is painted with the selection color and the text highlight goes.
//   ⇧-click and ⇧-arrows past the edge of a block do the same.
// - Esc selects the block around the caret or the text selection; Esc again
//   clears it. Arrows move a block selection, ⇧-arrows extend it, ⌫ / Delete
//   remove its blocks, ↵ on one block puts the caret at its end, ⌘C / ⌘X copy
//   and cut them. Typing does nothing while blocks are selected: a stray key
//   never replaces several blocks with one letter. ⌘A / Ctrl+A selects the
//   block's text first, then every block.
// - Everything a selection covers shows the same rounded box: selected blocks,
//   a node selection (an image, an equation, a divider) and, inside a text
//   selection, the atoms the browser does not paint (inline equations,
//   mentions, inline code, whole code blocks and media).
//
// The model is `NodeRangeSelection` (@tiptap/extension-node-range), so the
// block actions of the ⋯ menu (block-actions.ts), colors and comments read it
// as they read any selection: through `$from` / `$to` and its ranges. Nothing
// here touches the document schema or its Markdown: the paint is made of
// decorations, never of marks or attributes.

import { Extension } from "@tiptap/core";
import { NodeRangeSelection } from "@tiptap/extension-node-range";
import { Slice, type Node as PMNode } from "@tiptap/pm/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type SelectionRange,
  type Transaction,
} from "@tiptap/pm/state";
import type { Mappable } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** The class each selected block carries (app/globals.css). */
export const BLOCK_SELECTED_CLASS = "is-block-selected";
/** The class an inline atom or a whole inline-code run inside a text
    selection carries, so it shows the same box as the text around it. */
export const INLINE_SELECTED_CLASS = "is-inline-selected";
/** On the editor root while blocks are selected or about to be: hides the
    caret and the native text highlight. */
export const BLOCK_SELECTION_ROOT_CLASS = "has-block-selection";

/* ── What a block is ──────────────────────────────────────────────────── */

/** List items are blocks even though their schema group is not `block`. */
const ITEM_TYPES = new Set(["listItem", "taskItem"]);

/** A node a block selection can hold: a top-level-style block or a list item.
    A details summary or content wrapper is not one; its `details` is. */
export function isBlockUnit(node: PMNode): boolean {
  return node.type.isInGroup("block") || ITEM_TYPES.has(node.type.name);
}

/** A container whose first child is its own text: a list item, a quote, a
    callout, a details block. Selecting that first line selects the container. */
function ownsText(node: PMNode): boolean {
  return !node.isTextblock && !node.isAtom && node.firstChild?.isTextblock === true;
}

/** A container that is only a frame around blocks: a list. It is never a
    block of its own to arrow keys, which step into its items. */
function isWrapper(node: PMNode): boolean {
  if (node.isTextblock || node.isAtom || ownsText(node) || node.childCount === 0) return false;
  let blocks = true;
  node.forEach((child) => {
    if (!isBlockUnit(child)) blocks = false;
  });
  return blocks;
}

/**
 * The start of the innermost block holding `pos`: the textblock of a text
 * position, the block after (or before) a position between blocks, the
 * `details` of a summary.
 */
export function blockAt(doc: PMNode, pos: number): number | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  if (!$pos.parent.inlineContent) {
    const after = $pos.nodeAfter;
    if (after && isBlockUnit(after)) return pos;
    const before = $pos.nodeBefore;
    if (before && isBlockUnit(before)) return pos - before.nodeSize;
  }
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (isBlockUnit($pos.node(depth))) return $pos.before(depth);
  }
  return null;
}

function descendFirst(doc: PMNode, pos: number): number {
  let node = doc.nodeAt(pos);
  while (node && isWrapper(node) && node.firstChild && isBlockUnit(node.firstChild)) {
    pos += 1;
    node = node.firstChild;
  }
  return pos;
}

function descendLast(doc: PMNode, pos: number): number {
  let node = doc.nodeAt(pos);
  while (node && !node.isTextblock && !node.isAtom && node.lastChild && isBlockUnit(node.lastChild)) {
    pos += node.nodeSize - 1 - node.lastChild.nodeSize;
    node = node.lastChild;
  }
  return pos;
}

/** The block that follows `pos` in reading order, stepping into lists. */
export function blockAfter(doc: PMNode, pos: number): number | null {
  let $pos = doc.resolve(pos);
  for (;;) {
    const after = $pos.nodeAfter;
    if (after && isBlockUnit(after)) return descendFirst(doc, $pos.pos);
    if (after) {
      // A wrapper that is not a block (a details content): step into it; a
      // textblock that is not one (a summary): step over it.
      $pos = doc.resolve($pos.pos + (after.isTextblock || after.isLeaf ? after.nodeSize : 1));
      continue;
    }
    if ($pos.depth === 0) return null;
    $pos = doc.resolve($pos.after());
  }
}

/** The block that precedes `pos` in reading order: the last item of a list
    above, or the container whose first line is just above. */
export function blockBefore(doc: PMNode, pos: number): number | null {
  let $pos = doc.resolve(pos);
  for (;;) {
    const before = $pos.nodeBefore;
    if (before && isBlockUnit(before)) return descendLast(doc, $pos.pos - before.nodeSize);
    if (before) {
      $pos = doc.resolve($pos.pos - before.nodeSize);
      continue;
    }
    if ($pos.depth === 0) return null;
    if (isBlockUnit($pos.parent) && !isWrapper($pos.parent)) return $pos.before();
    $pos = doc.resolve($pos.before());
  }
}

interface BlockSpan {
  from: number;
  to: number;
  depth: number;
}

/**
 * The siblings a selection from the block at `anchor` to the block at `head`
 * covers. It climbs to the closest level where every covered node is a block,
 * and selects a container rather than its own first line alone (a list item
 * rather than its paragraph): deleting that line by itself would leave a
 * container without its text.
 */
export function blockSpanBetween(doc: PMNode, anchor: number, head: number): BlockSpan | null {
  const anchorNode = doc.nodeAt(anchor);
  const headNode = doc.nodeAt(head);
  if (!anchorNode || !headNode) return null;
  const lo = Math.min(anchor, head);
  const hi = Math.max(anchor + anchorNode.nodeSize, head + headNode.nodeSize);
  const $lo = doc.resolve(lo);
  for (let depth = $lo.sharedDepth(hi); depth >= 0; depth--) {
    const parent = $lo.node(depth);
    const start = depth === 0 ? 0 : $lo.start(depth);
    let from = -1;
    let to = -1;
    let firstIndex = -1;
    let blocks = true;
    parent.forEach((child, offset, index) => {
      const childFrom = start + offset;
      const childTo = childFrom + child.nodeSize;
      if (childFrom >= hi || childTo <= lo) return;
      if (from < 0) {
        from = childFrom;
        firstIndex = index;
      }
      to = childTo;
      if (!isBlockUnit(child)) blocks = false;
    });
    if (depth > 0 && (from < 0 || !blocks || (ownsText(parent) && firstIndex === 0))) continue;
    return from < 0 ? null : { from, to, depth };
  }
  return null;
}

/* ── The selection ────────────────────────────────────────────────────── */

/**
 * Whole blocks, from the block the gesture started on (`anchorBlock`) to the
 * one it reached (`headBlock`). Both are kept beside the covered range so a
 * ⇧-arrow that shrinks the selection gets back to the block it started from,
 * after the range climbed to a whole list.
 */
export class BlockSelection extends NodeRangeSelection {
  readonly anchorBlock: number;
  readonly headBlock: number;

  private constructor(doc: PMNode, span: BlockSpan, anchorBlock: number, headBlock: number) {
    const $from = doc.resolve(span.from);
    const $to = doc.resolve(span.to);
    const backward = headBlock < anchorBlock;
    super(backward ? $to : $from, backward ? $from : $to, span.depth);
    this.anchorBlock = anchorBlock;
    this.headBlock = headBlock;
  }

  /** The blocks from the block starting at `anchorBlock` to the one starting
      at `headBlock`; the first block of the document when both are gone. */
  static create(doc: PMNode, anchorBlock: number, headBlock: number): BlockSelection {
    const span = blockSpanBetween(doc, anchorBlock, headBlock);
    if (span) return new BlockSelection(doc, span, anchorBlock, headBlock);
    const first = doc.firstChild;
    return new BlockSelection(doc, { from: 0, to: first ? first.nodeSize : 0, depth: 0 }, 0, 0);
  }

  /** The blocks from the one holding `anchor` to the one holding `head`. */
  static between(doc: PMNode, anchor: number, head: number): BlockSelection {
    const anchorBlock = blockAt(doc, anchor) ?? 0;
    return BlockSelection.create(doc, anchorBlock, blockAt(doc, head) ?? anchorBlock);
  }

  override eq(other: Selection): boolean {
    return other instanceof BlockSelection && other.from === this.from && other.to === this.to &&
      other.anchorBlock === this.anchorBlock && other.headBlock === this.headBlock;
  }

  override map(doc: PMNode, mapping: Mappable): BlockSelection {
    return BlockSelection.between(doc, mapping.map(this.anchorBlock, 1), mapping.map(this.headBlock, 1));
  }

  /** Deleting selected blocks removes them whole — a list emptied of its
      items goes with them — and leaves the caret where they were. */
  override replace(tr: Transaction, content: Slice = Slice.empty): void {
    if (content.size > 0) {
      super.replace(tr, content);
      return;
    }
    const steps = tr.steps.length;
    tr.deleteRange(this.from, this.to);
    const pos = Math.min(tr.mapping.slice(steps).map(this.from), tr.doc.content.size);
    tr.setSelection(Selection.near(tr.doc.resolve(pos), -1));
  }

  override toJSON() {
    return { type: "blockSelection", anchor: this.anchorBlock, head: this.headBlock, depth: this.depth };
  }

  static override fromJSON(doc: PMNode, json: { anchor: number; head: number }): BlockSelection {
    return BlockSelection.create(doc, json.anchor, json.head);
  }

  override getBookmark(): BlockSelectionBookmark {
    return new BlockSelectionBookmark(this.anchorBlock, this.headBlock, this.depth ?? 0);
  }
}

/** Undo history keeps a selection as a bookmark, mapped through later steps. */
class BlockSelectionBookmark {
  constructor(readonly anchor: number, readonly head: number, readonly depth: number) {}

  map(mapping: Mappable): BlockSelectionBookmark {
    return new BlockSelectionBookmark(mapping.map(this.anchor, 1), mapping.map(this.head, 1), this.depth);
  }

  resolve(doc: PMNode): BlockSelection {
    const size = doc.content.size;
    return BlockSelection.between(doc, Math.min(this.anchor, size), Math.min(this.head, size));
  }
}

try {
  Selection.jsonID("blockSelection", BlockSelection);
} catch {
  // Already registered: a hot reload evaluates this module again.
}

export function isBlockSelection(selection: Selection): selection is BlockSelection {
  return selection instanceof BlockSelection;
}

/**
 * The block selection a selection stands for when it is turned into one:
 * Esc, a ⇧-click on a block handle. A node selection is its block; an inline
 * node or a text selection stands for the blocks around it.
 */
export function blockSelectionFrom(doc: PMNode, selection: Selection): BlockSelection {
  if (selection instanceof BlockSelection) return selection;
  if (selection instanceof NodeSelection && isBlockUnit(selection.node)) {
    return BlockSelection.create(doc, selection.from, selection.from);
  }
  if (selection instanceof NodeSelection) return BlockSelection.between(doc, selection.from, selection.from);
  return BlockSelection.between(doc, selection.anchor, selection.head);
}

/** The block a selection started on, as a block selection would keep it. */
export function anchorBlockOf(doc: PMNode, selection: Selection): number | null {
  if (selection instanceof BlockSelection) return selection.anchorBlock;
  if (selection instanceof NodeSelection && isBlockUnit(selection.node)) return selection.from;
  return blockAt(doc, selection.anchor);
}

/** A mouse drag in progress, as the plugin tracks it. */
export interface DragGesture {
  /** It started in the margin beside the text. */
  fromMargin: boolean;
  /** The block under the pointer, when it is not where the text selection
      ends: an image, an equation or a divider, which the browser's text
      selection never enters. */
  pointer?: number | null;
}

/**
 * What a mouse selection becomes when the button is released: the blocks it
 * reached when its two ends are in different blocks — or the pointer is over
 * another block — or when it started in the margin beside the text; `null`
 * for a selection inside one block.
 */
export function blockSelectionForDrag(
  doc: PMNode,
  selection: Selection,
  gesture: DragGesture
): BlockSelection | null {
  if (!(selection instanceof TextSelection)) return null;
  const anchor = blockAt(doc, selection.anchor);
  if (anchor === null) return null;
  const pointer = gesture.pointer ?? null;
  if (pointer !== null && pointer !== anchor) return BlockSelection.create(doc, anchor, pointer);
  const head = blockAt(doc, selection.head);
  if (head === null || selection.empty) return null;
  if (anchor === head && !gesture.fromMargin) return null;
  return BlockSelection.create(doc, anchor, head);
}

/** The next selection when the head of `selection` moves one block in `dir`;
    `null` at the edge of the document. Steps over blocks the range already
    holds, so every press changes what is selected. */
function stepHead(doc: PMNode, selection: BlockSelection, dir: 1 | -1): BlockSelection | null {
  let head = selection.headBlock;
  for (let guard = 0; guard < 1000; guard++) {
    const node = doc.nodeAt(head);
    if (!node) return null;
    const next = dir > 0 ? blockAfter(doc, head + node.nodeSize) : blockBefore(doc, head);
    if (next === null) return null;
    head = next;
    const candidate = BlockSelection.create(doc, selection.anchorBlock, head);
    if (candidate.from !== selection.from || candidate.to !== selection.to) return candidate;
  }
  return null;
}

/** One block above or below a block selection, as the arrow keys move it. */
function moveSelection(doc: PMNode, selection: BlockSelection, dir: 1 | -1): BlockSelection | null {
  let pos = dir > 0 ? blockAfter(doc, selection.to) : blockBefore(doc, selection.from);
  for (let guard = 0; pos !== null && guard < 1000; guard++) {
    const candidate = BlockSelection.create(doc, pos, pos);
    if (candidate.from !== selection.from || candidate.to !== selection.to) return candidate;
    const node = doc.nodeAt(pos);
    if (!node) return null;
    pos = dir > 0 ? blockAfter(doc, pos + node.nodeSize) : blockBefore(doc, pos);
  }
  return null;
}

/* ── Paint ────────────────────────────────────────────────────────────── */

function blockDecorations(doc: PMNode, ranges: readonly SelectionRange[]): DecorationSet {
  return DecorationSet.create(
    doc,
    ranges.map((range) =>
      Decoration.node(range.$from.pos, range.$to.pos, { class: BLOCK_SELECTED_CLASS })
    )
  );
}

/**
 * Inside a text selection, the pieces the browser leaves unpainted or paints
 * in part: inline atoms (equations, mentions), inline-code runs whose box
 * includes padding the highlight misses, and whole code blocks or media.
 * Only what the selection covers entirely: a part of an inline code is text,
 * and the native highlight is the right mark for it.
 */
function coveredDecorations(doc: PMNode, from: number, to: number): DecorationSet | null {
  const decorations: Decoration[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isBlock && (node.isAtom || node.type.spec.code)) {
      const inner = node.isAtom ? 0 : 1;
      if (from <= pos + inner && to >= pos + node.nodeSize - inner) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: BLOCK_SELECTED_CLASS }));
      }
      return false;
    }
    if (!node.isTextblock) return true;
    let runFrom = -1;
    let runTo = -1;
    const closeRun = () => {
      if (runFrom >= 0 && runFrom >= from && runTo <= to) {
        decorations.push(Decoration.inline(runFrom, runTo, { class: INLINE_SELECTED_CLASS }));
      }
      runFrom = -1;
    };
    node.forEach((child, offset) => {
      const childFrom = pos + 1 + offset;
      const childTo = childFrom + child.nodeSize;
      if (child.isText && child.marks.some((mark) => mark.type.spec.code)) {
        if (runFrom < 0) runFrom = childFrom;
        runTo = childTo;
        return;
      }
      closeRun();
      if (child.isAtom && !child.isText && child.type.name !== "hardBreak" &&
          childFrom >= from && childTo <= to) {
        decorations.push(Decoration.node(childFrom, childTo, { class: INLINE_SELECTED_CLASS }));
      }
    });
    closeRun();
    return false;
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : null;
}

/* ── The extension ────────────────────────────────────────────────────── */

const blockSelectionKey = new PluginKey("blockSelection");

export interface BlockSelectionOptions {
  /**
   * Whether Esc selects the block around the caret. A composer whose Esc
   * cancels it turns this off; Esc still clears a block selection there.
   */
  selectOnEscape: boolean;
}

function dispatchSelection(view: EditorView, selection: Selection): true {
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

/** Whether a press lands beside the text, in the editor's own padding (the
    page gutter's band), rather than on a block or in the gap between two. */
function inMargin(view: EditorView, event: MouseEvent): boolean {
  if (event.target !== view.dom) return false;
  const rect = view.dom.getBoundingClientRect();
  const style = view.dom.ownerDocument.defaultView?.getComputedStyle(view.dom);
  const left = rect.left + (parseFloat(style?.paddingLeft ?? "") || 0);
  const right = rect.right - (parseFloat(style?.paddingRight ?? "") || 0);
  return event.clientX < left || event.clientX > right;
}

/** ⇧-arrow: extends a block selection, turns a block's node selection into
    one, and a text selection whose head leaves its block. */
function extend(view: EditorView, state: EditorState, dir: 1 | -1, vertical: boolean): boolean {
  const { doc, selection } = state;
  if (selection instanceof BlockSelection) {
    if (!vertical) return true;
    const next = stepHead(doc, selection, dir);
    return next ? dispatchSelection(view, next) : true;
  }
  if (selection instanceof NodeSelection && isBlockUnit(selection.node)) {
    if (!vertical) return false;
    const start = BlockSelection.create(doc, selection.from, selection.from);
    return dispatchSelection(view, stepHead(doc, start, dir) ?? start);
  }
  if (!(selection instanceof TextSelection)) return false;
  // Shrinking a text selection from its other end stays a text gesture.
  if (dir > 0 ? selection.head !== selection.to : selection.head !== selection.from) return false;
  const edge = vertical ? (dir > 0 ? "down" : "up") : dir > 0 ? "forward" : "backward";
  if (!view.endOfTextblock(edge, state)) return false;
  const anchor = blockAt(doc, selection.anchor);
  const head = blockAt(doc, selection.head);
  if (anchor === null || head === null) return false;
  const start = BlockSelection.create(doc, anchor, head);
  return dispatchSelection(view, stepHead(doc, start, dir) ?? start);
}

/**
 * ⌘A / Ctrl+A, the way Notion does it: the first press selects the text of
 * the block the caret is in (a paragraph, a code block), the next one every
 * block of the document as a block selection. A press in an empty block, on a
 * selected node or on blocks already selected goes straight to every block.
 */
export function selectAll(view: EditorView, state: EditorState): boolean {
  const { doc, selection } = state;
  if (selection instanceof TextSelection && selection.$from.sameParent(selection.$to)) {
    const { $from } = selection;
    const start = $from.start();
    const end = $from.end();
    if (end > start && (selection.from !== start || selection.to !== end)) {
      return dispatchSelection(view, TextSelection.create(doc, start, end));
    }
  }
  const last = doc.lastChild;
  if (!last) return false;
  return dispatchSelection(view, BlockSelection.create(doc, 0, doc.content.size - last.nodeSize));
}

/** The low-priority half: Esc from a text selection or a caret, consulted
    after every menu that closes on Esc (the “/” and “@” suggestions). */
const BlockSelectionEscape = Extension.create<BlockSelectionOptions>({
  name: "blockSelectionEscape",
  priority: 2,
  addOptions: () => ({ selectOnEscape: true }),
  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        if (!this.options.selectOnEscape || !editor.isEditable) return false;
        const { state, view } = editor;
        if (state.selection instanceof BlockSelection) return false;
        return dispatchSelection(view, blockSelectionFrom(state.doc, state.selection));
      },
    };
  },
});

export const BlockSelectionExtension = Extension.create<BlockSelectionOptions>({
  name: "blockSelection",
  // Before the gap cursor and the list keymaps, which would read a block
  // selection as an ordinary one; every key below acts on block selections
  // (or on a selection leaving its block) and lets the rest through.
  priority: 1000,
  addOptions: () => ({ selectOnEscape: true }),

  addExtensions() {
    return [BlockSelectionEscape.configure({ selectOnEscape: this.options.selectOnEscape })];
  },

  addKeyboardShortcuts() {
    const onBlocks = (run: (view: EditorView, selection: BlockSelection) => boolean) =>
      ({ editor }: { editor: { state: EditorState; view: EditorView } }) => {
        const { selection } = editor.state;
        return selection instanceof BlockSelection ? run(editor.view, selection) : false;
      };
    const remove = onBlocks((view) => {
      view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
      return true;
    });
    return {
      "Shift-ArrowDown": ({ editor }) => extend(editor.view, editor.state, 1, true),
      "Shift-ArrowUp": ({ editor }) => extend(editor.view, editor.state, -1, true),
      "Shift-ArrowRight": ({ editor }) => extend(editor.view, editor.state, 1, false),
      "Shift-ArrowLeft": ({ editor }) => extend(editor.view, editor.state, -1, false),
      ArrowDown: onBlocks((view, selection) => {
        const next = moveSelection(view.state.doc, selection, 1);
        return next ? dispatchSelection(view, next) : true;
      }),
      ArrowUp: onBlocks((view, selection) => {
        const next = moveSelection(view.state.doc, selection, -1);
        return next ? dispatchSelection(view, next) : true;
      }),
      ArrowLeft: onBlocks((view, selection) =>
        dispatchSelection(view, Selection.near(view.state.doc.resolve(selection.from), 1))),
      ArrowRight: onBlocks((view, selection) =>
        dispatchSelection(view, Selection.near(view.state.doc.resolve(selection.to), -1))),
      Enter: onBlocks((view, selection) => {
        if (selection.ranges.length !== 1) return true;
        const { doc } = view.state;
        const node = doc.nodeAt(selection.from);
        if (node?.isAtom && NodeSelection.isSelectable(node)) {
          return dispatchSelection(view, NodeSelection.create(doc, selection.from));
        }
        return dispatchSelection(view, Selection.near(doc.resolve(selection.to), -1));
      }),
      "Mod-a": ({ editor }) => selectAll(editor.view, editor.state),
      Backspace: remove,
      Delete: remove,
      "Mod-Backspace": remove,
      Escape: onBlocks((view, selection) => {
        // Esc again leaves nothing selected, as in Notion: the caret goes back
        // to where the blocks start, and the editor lets go of the focus.
        dispatchSelection(view, Selection.near(view.state.doc.resolve(selection.from), 1));
        view.dom.blur();
        return true;
      }),
    };
  },

  addProseMirrorPlugins() {
    // The mouse gesture in progress. Kept per editor, outside the state: it is
    // pointer state, and a transaction for every press would reach the live
    // session and the undo history for nothing.
    let drag: DragGesture | null = null;
    // Whether the blocks were painted during this drag, to unpaint them when
    // it ends in one block.
    let previewed = false;
    let touch = false;

    const preview = (state: EditorState) =>
      drag ? blockSelectionForDrag(state.doc, state.selection, drag) : null;

    const endDrag = (view: EditorView, gesture: DragGesture) => {
      if (drag !== gesture || view.isDestroyed) return;
      drag = null;
      const blocks = blockSelectionForDrag(view.state.doc, view.state.selection, gesture);
      if (blocks) view.dispatch(view.state.tr.setSelection(blocks));
      else if (previewed) view.dispatch(view.state.tr.setMeta(blockSelectionKey, "drag-end"));
    };

    return [
      new Plugin({
        key: blockSelectionKey,
        props: {
          attributes: (state): Record<string, string> => {
            const shown = state.selection instanceof BlockSelection || preview(state) !== null;
            return shown ? { class: BLOCK_SELECTION_ROOT_CLASS } : {};
          },

          decorations: (state) => {
            const { doc, selection } = state;
            if (selection instanceof BlockSelection) return blockDecorations(doc, selection.ranges);
            const dragged = preview(state);
            if (dragged) {
              previewed = true;
              return blockDecorations(doc, dragged.ranges);
            }
            if (selection.empty || selection instanceof NodeSelection) return null;
            return coveredDecorations(doc, selection.from, selection.to);
          },

          handleDOMEvents: {
            pointerdown: (_view, event) => {
              // A finger keeps the platform's own selection (long press and
              // its handles): block selection by drag is a mouse gesture.
              touch = event.pointerType === "touch";
              return false;
            },
            mousedown: (view, event) => {
              if (event.button !== 0 || touch || event.metaKey || event.ctrlKey || event.altKey) return false;
              const { state } = view;
              if (event.shiftKey && state.selection instanceof BlockSelection) {
                const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
                const head = hit ? blockAt(state.doc, hit.inside >= 0 ? hit.inside : hit.pos) : null;
                if (head === null) return false;
                event.preventDefault();
                view.focus();
                return dispatchSelection(view, BlockSelection.create(state.doc, state.selection.anchorBlock, head));
              }
              const blockUnder = (pointer: MouseEvent) => {
                let hit: ReturnType<EditorView["posAtCoords"]> = null;
                try {
                  hit = view.posAtCoords({ left: pointer.clientX, top: pointer.clientY });
                } catch {
                  // A document without layout (a test, a detached view) has no
                  // point to read: the gesture then relies on the selection.
                }
                return hit ? blockAt(view.state.doc, hit.inside >= 0 ? hit.inside : hit.pos) : null;
              };
              const gesture: DragGesture = { fromMargin: inMargin(view, event), pointer: blockUnder(event) };
              drag = gesture;
              previewed = false;
              const doc = view.dom.ownerDocument;
              const isAtomAt = (pos: number | null | undefined) =>
                pos !== null && pos !== undefined && view.state.doc.nodeAt(pos)?.isAtom === true;
              // The block under the pointer: a press that reaches an atom
              // block (an image, an equation) selects blocks although the text
              // selection never gets there. Only entering or leaving an atom
              // redraws: over text, the selection's own transactions do, and
              // a transaction ahead of them would write a stale selection
              // back into the page in the middle of the browser's drag.
              const onMove = (move: MouseEvent) => {
                if (drag !== gesture || view.isDestroyed) return;
                const block = blockUnder(move);
                if (block === null || block === gesture.pointer) return;
                const redraw = isAtomAt(block) || isAtomAt(gesture.pointer);
                gesture.pointer = block;
                if (redraw) view.dispatch(view.state.tr.setMeta(blockSelectionKey, "drag-move"));
              };
              doc.addEventListener("mousemove", onMove);
              doc.addEventListener(
                "mouseup",
                () => {
                  doc.removeEventListener("mousemove", onMove);
                  // After ProseMirror has read the selection the release left:
                  // dispatching from the event itself would write the selection
                  // of BEFORE the click back into the page, and lose the click.
                  setTimeout(() => endDrag(view, gesture));
                },
                { once: true }
              );
              return false;
            },
            // A node dragged away (an image, a block from its handle) ends
            // without the mouseup this gesture waits for.
            dragstart: () => {
              drag = null;
              return false;
            },
            beforeinput: (view, event) => {
              const { selection } = view.state;
              if (!(selection instanceof BlockSelection)) return false;
              const { inputType } = event as InputEvent;
              const deletes = inputType.startsWith("delete");
              // Undo and redo from the Edit menu arrive here too, and pass.
              if (!deletes && !inputType.startsWith("insert")) return false;
              event.preventDefault();
              // A virtual keyboard's delete arrives as input, not as a key.
              if (deletes) view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
              return true;
            },
          },

          // Typing over selected blocks does nothing (see the top of the file).
          handleKeyDown: (view, event) => {
            if (!(view.state.selection instanceof BlockSelection)) return false;
            if (event.isComposing || event.key === "Process" || event.key === "Dead") return true;
            return event.key.length === 1 && !event.metaKey && !event.ctrlKey;
          },
          handleTextInput: (view) => view.state.selection instanceof BlockSelection,
        },
      }),
    ];
  },
});
