// What the menu ⋯ DOES — without a line of React.
//
// The menu is just a list of labels: everything related to the document
// is here, in functions that take an editor and render a boolean. This is what
// which allows lib/pages-chrome.test.ts to play them on a real mounted editor
// on the real register, without mounting an interface.
//
// The thread that crosses the file: **nothing works on “the block”**, everything
// works on a RANGE OF BLOCKS. The case of a single block is only that of a
// range that contains only one — duplicate, delete, color and copy the
// link covers both without one more line.
//
// Two exceptions, and these are exactly the two places where the selection
// multi-block selection appeared not to exist:
//
// - `turnBlocksInto` — tiptap conversion commands read the
// selection themselves, and misread the one placed by the handle;
// - `selectBlockFromHandle` — go SEARCH the handle erases the selection
//    that we had just made.
//
// Both are written below, along with what they fix.

import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  BLOCK_ID_ATTRIBUTE,
  type PageBlock,
} from "@/components/pages/blocks/types";
import { flashBlockAt } from "@/components/pages/block-flash";

/**
 * The width of the BUTTONS of the gutter, in pixels: two buttons of 24 px,
 * their `gap-0.5` and the `pr-1` which separates them from the block. This is what `BlockGutter`
 * actually occupies — not the strip that makes it appear, below.
 */
export const GUTTER_WIDTH = 54;

/**
 * The width of the HOVERBAND, in pixels: the entire reserve as the column
 * of the document leaves to its left (`md:pl-24`, components/pages/page-view.tsx).
 *
 * This is NOT `GUTTER_WIDTH`, and the difference is what caused the
 * first version: the buttons only occupy the 54 px stuck to the text, but
 * the gutter we SEE — and therefore the one we aim for — is the entire margin. In
 * limiting it to the buttons, there remained a dead band of 42 px at the left edge,
 * exactly where the mouse arrives when it comes from the sidebar. Measured at
 * browser: stop at 25 px of text, handle comes out; stop at 70 px, nothing.
 *
 * It is here, in a module without React, because it is read by two
 * places that do not see each other: the rule of `app/globals.css`
 * which extends the hover surface of the editor, and the class of the column which
 * reserves the place for him. `lib/pages-chrome.test.ts` compares the three.
 */
export const GUTTER_HOVER = 96;

/** A range of entire blocks, in absolute document positions. */
export interface BlockRange {
  from: number;
  to: number;
}

/**
 * The range of blocks that the current selection carries.
 *
 * `blockRange` from ProseMirror goes back to the smallest common ancestor that
 * or a series of blocks: a cursor in the middle of a paragraph makes the
 * entire paragraph, a selection that runs over three blocks makes them all
 * three, and a `NodeSelection` on a flyer makes the flyer WITH sound
 * content — it is this last point which means that duplicating or deleting takes
 * children without having to look for them.
 */
export function blockRange(editor: Editor): BlockRange | null {
  const { $from, $to } = editor.state.selection;
  const range = $from.blockRange($to);
  if (!range) return null;
  return { from: range.start, to: range.end };
}

/**
 * Place the selection on the block that begins at `pos` — what a click on does
 * the handle before opening the menu. Without it, the menu would act where the cursor
 * was hanging around, not on the block we flew over.
 */
export function selectBlockAt(editor: Editor, pos: number): boolean {
  const { doc } = editor.state;
  if (pos < 0 || pos > doc.content.size) return false;
  const node = doc.nodeAt(pos);
  if (!node) return false;
  const selection = NodeSelection.create(doc, pos);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  return true;
}

/**
 * What a click on the HANDLE selects, once we take this into account
 * which was already selected.
 *
 * Three cases, and the second is the one that was missing:
 *
 * - ⇧-click: extend from the current selection to this block;
 * - the selection ALREADY has several blocks and this one is one of them: we
 * don't touch it. This is what makes multi-block selection usable —
 * we sweep three blocks with the mouse, we look for the handle, and the
 * handle kept the selection to a single block, the one it hovers over. THE
 * gesture existed, it faded just when it was time to use it;
 * - otherwise: this block, and it alone.
 *
 * Making `true` without dispatching anything (case 2) is not a failure: it is “the
 * selection is already the correct one", and the caller opens his menu over it.
 */
export function selectBlockFromHandle(
  editor: Editor,
  pos: number,
  extend: boolean
): boolean {
  const { doc, selection } = editor.state;
  const node = doc.nodeAt(pos);
  if (!node) return false;

  if (extend) {
    const from = Math.max(Math.min(selection.from, pos), 0);
    const to = Math.min(
      Math.max(selection.to, pos + node.nodeSize),
      doc.content.size
    );
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(doc, from, to))
    );
    return true;
  }

  const range = blockRange(editor);
  const covered =
    range !== null &&
    pos >= range.from &&
    pos + node.nodeSize <= range.to &&
    selectedBlockCount(editor) > 1;
  return covered ? true : selectBlockAt(editor, pos);
}

/**
 * The FIRST level blocks that the range covers — not their descendants.
 *
 * This is the distinction that matters for the menu: three selected blocks make
 * “3 blocks”, even when one of them is a list of ten items. Go down in
 * the tree would give a count that no one recognizes.
 */
function blocksIn(editor: Editor, range: BlockRange) {
  const $from = editor.state.doc.resolve(range.from);
  const parent = $from.parent;
  const parentStart = $from.start();
  const blocks: Array<{ pos: number; id: string | null }> = [];
  parent.forEach((child, offset) => {
    const pos = parentStart + offset;
    if (pos < range.from || pos >= range.to) return;
    const id = child.attrs?.[BLOCK_ID_ATTRIBUTE];
    blocks.push({ pos, id: typeof id === "string" ? id : null });
  });
  return blocks;
}

/** The IDs of the blocks covered by the selection, in document order. */
export function selectedBlockIds(editor: Editor): string[] {
  const range = blockRange(editor);
  if (!range) return [];
  return blocksIn(editor, range)
    .map((block) => block.id)
    .filter((id): id is string => id !== null);
}

/** The number of blocks on which the menu will act — what it announces at the top
    when there is more than one. */
export function selectedBlockCount(editor: Editor): number {
  const range = blockRange(editor);
  if (!range) return 0;
  return blocksIn(editor, range).length;
}

/**
 * The page cited when selected is ONE subpage block, and nothing else.
 *
 * This is what switches the menu ⋯ from a block vocabulary to a
 * PAGE vocabulary (MIN-272): duplicate copies the page, delete updates it
 * the trash, and “turn into” as the colors disappear — a
 * link to a document does not convert to a quote and has no color
 * of text to choose from.
 *
 * `null` as soon as the selection concerns something else or several blocks:
 * a mixed selection falls back on the ordinary menu, where “duplicate” means
 * duplicate blocks. Two vocabularies in the same menu, it’s a menu that
 * lies about half of what he offers.
 */
export function selectedSubpageId(editor: Editor): string | null {
  const range = blockRange(editor);
  if (!range) return null;
  const $from = editor.state.doc.resolve(range.from);
  const parentStart = $from.start();

  let found: string | null = null;
  let count = 0;
  $from.parent.forEach((child, offset) => {
    const pos = parentStart + offset;
    if (pos < range.from || pos >= range.to) return;
    count += 1;
    const id = child.attrs?.pageId;
    if (child.type.name === "subpage" && typeof id === "string" && id) {
      found = id;
    }
  });
  return count === 1 ? found : null;
}

/**
 * Is the selection ONLY media — images, files (MIN-282)?
 *
 * The same need as `selectedSubpageId`, and the same reason: the menu must
 * change vocabulary rather than proposing gestures that make no sense.
 * A file does not “transform” into a quote; it has no color for
 * text to choose, and DUPLICATE does not duplicate anything — it takes a second
 * reference to the same bytes, which reads like a copy without actually being one.
 *
 * True on a multiple selection which only has that: three images selected
 * ask exactly the same questions as one. False on a selection
 * melee, which falls back on the ordinary menu — two vocabularies in the same
 * menu, it's a menu that lies about half of what it offers.
 */
export function selectionIsMediaOnly(editor: Editor): boolean {
  const range = blockRange(editor);
  if (!range) return false;
  const $from = editor.state.doc.resolve(range.from);
  const parentStart = $from.start();

  let count = 0;
  let media = 0;
  $from.parent.forEach((child, offset) => {
    const pos = parentStart + offset;
    if (pos < range.from || pos >= range.to) return;
    count += 1;
    if (child.type.name === "image" || child.type.name === "pageFile") media += 1;
  });
  return count > 0 && count === media;
}

/**
 * Place a subpage block towards `pageId` at position `at` — what does
 * “duplicate” on a sub-page block, once the page has been copied.
 *
 * The position is passed, and not reread: the copy is a round trip to the
 * server, and during this time the selection was able to go elsewhere. reread it at
 * return would place the copy under the block where we are THEN, not under the one
 * which we duplicated. It is limited to the document rather than refused — the worst
 * that can happen is a block at the end of the page, where refusing would lose a
 * page already written in base.
 *
 * Without `focus()` either: resume the cursor one second after clicking
 * would steal from anyone who started typing again in the meantime.
 */
export function insertSubpageAfter(
  editor: Editor,
  pageId: string,
  at: number
): boolean {
  const pos = Math.min(Math.max(at, 0), editor.state.doc.content.size);
  return editor
    .chain()
    .insertContentAt(pos, { type: "subpage", attrs: { pageId } })
    .run();
}

/* ── Two DOM Pitfalls of Node Views ──────────────────────────────── */

/**
 * The element that REALLY carries the style of a block, from what
 * `view.nodeDOM` retourne.
 *
 * A React node view (the subpage, the task item) is not rendered in
 * this element: tiptap-react creates a NU `div.react-renderer` and mounts it
 * `NodeViewWrapper` in it. The whole style of the block — its padding, its height
 * of line — therefore lives a notch lower, and measuring the container amounts to
 * measure nothing: the gutter (handle + `+`) was positioned on a div without
 * padding and floated above the text, of exactly the value of `py-`
 * the block.
 *
 * We go down a notch, and only one: what we are looking for is the block, not its
 * contenu.
 */
export function styledBox(dom: HTMLElement): HTMLElement {
  const inner = dom.firstElementChild;
  return dom.classList.contains("react-renderer") &&
    inner instanceof HTMLElement
    ? inner
    : dom;
}

/* The anchor of a node view (the subpage block, the pill of a mention) and the
   click that keeps it out of the Link extension live in
   components/editor-node-link.ts: it is not specific to pages — one
   description makes one too. */

/* ── Actions ──────────────────────────── ──────────────────────────── */

/**
 * The identity attribute REMOVED from an entire subtree.
 *
 * Duplicate by copying the attributes as they are would give two blocks carrying
 * the same `blockId` — therefore two identical anchors, and one backup per block
 * (MIN-271) which would write one over the other. We remove the ID, `UniqueID`
 * install a new one when inserted.
 */
export function withoutBlockIds(content: JSONContent[]): JSONContent[] {
  return content.map((node) => {
    const attrs = { ...node.attrs };
    delete attrs[BLOCK_ID_ATTRIBUTE];
    return {
      ...node,
      ...(node.attrs ? { attrs } : {}),
      ...(node.content ? { content: withoutBlockIds(node.content) } : {}),
    };
  });
}

/**
 * Place a selection of TEXT that runs from one end of the text range to the other
 * blocks. This is the selection form that tiptap convert commands
 * can read; a `NodeSelection` — the one placed on the handle — is not one
 * one, and that's where everything was at stake (see `turnBlocksInto`).
 *
 * `TextSelection.between` searches for text positions closest to
 * two edges and falls on a node selection if there is none — one
 * separator, a subpage. Nothing more to protect.
 */
function spreadOverBlocks(editor: Editor): boolean {
  const range = blockRange(editor);
  if (!range) return false;
  const { doc } = editor.state;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.between(doc.resolve(range.from), doc.resolve(range.to))
    )
  );
  return true;
}

/**
 * “Transform to” — on the WHOLE selection, not its first block.
 *
 * This is the gesture that the ⋯menu and registry shortcuts all trigger
 * both, and he can't just call `block.turnInto`: a
 * list of three items, converted from the handle, emerged as a list
 * numbered with ONE item followed by two bare paragraphs. The handle selects the
 * whole block (`NodeSelection`), and `toggleOrderedList` does not know what in
 * do: it doesn't see a parent list to retype, falls back on its path
 * generic, and this only catches the first block.
 *
 * Two actions, therefore, before converting:
 *
 * 1. **spread** the selection over the entire range, in text selection;
 * 2. **flatten** (`clearNodes`): the items leave their list, the content
 * leaves the leaflet, everything becomes a series of blocks of the same level again.
 *
 * The second is what gives the menu a response in ALL directions, and not
 * only towards lists: “list → paragraph” and “list → quote” does not
 * They did absolutely nothing before — `setParagraph` and `toggleBlockquote`
 * do not delist. A list becomes three paragraphs, or a quote that
 * carries all three; three paragraphs become a list of three
 * items. “Transform into” means the same thing in both senses.
 *
 * What it costs, and who is covered: the conversion is based on NEW blocks,
 * therefore new `blockId`. This was already the case with a simple paragraph → title
 * before this change — a converted block is not the same block.
 */
export function turnBlocksInto(editor: Editor, block: PageBlock): boolean {
  if (!block.turnInto) return false;
  if (!spreadOverBlocks(editor)) return false;
  editor.commands.clearNodes();
  spreadOverBlocks(editor);
  return block.turnInto(editor);
}

/** Duplicate the selection JUST BELOW her, including children. */
export function duplicateBlocks(editor: Editor): boolean {
  const range = blockRange(editor);
  if (!range) return false;
  const slice = editor.state.doc.slice(range.from, range.to);
  const content = slice.content.toJSON() as JSONContent[] | null;
  if (!content || content.length === 0) return false;
  return editor
    .chain()
    .focus()
    .insertContentAt(range.to, withoutBlockIds(content))
    .run();
}

/** Delete the selection, including children. */
export function deleteBlocks(editor: Editor): boolean {
  const range = blockRange(editor);
  if (!range) return false;
  return editor.chain().focus().deleteRange(range).run();
}

/**
 * Insert an empty paragraph above or below the block that begins
 * `pos`, cursor in, and start the “/” menu: the `+` of the margin does not pose
 * not a paragraph, he opens the catalog — it’s Notion’s gesture.
 *
 * The “/” is typed IN the document rather than simulated on the keyboard: the menu is
 * a ProseMirror suggestion, it opens to the text in front of the cursor, hence
 * qu'il vienne.
 */
export function insertBlockAround(
  editor: Editor,
  pos: number,
  where: "above" | "below"
): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  const at = where === "below" ? pos + node.nodeSize : pos;
  return editor
    .chain()
    .insertContentAt(at, { type: "paragraph" })
    .focus(at + 1)
    .insertContent("/")
    .run();
}

/**
 * Write FOLLOWING the document, from the gap under the last block.
 *
 * A document ends where its last block ends, and below that block it
 * there is nothing to click: to resume writing at the end of a page, it
 * had to aim at the last line at the pixel then press Enter. The reserve
 * bottom clickable (components/pages/page-editor.tsx) calls this and renders the
 * obvious gesture - we click under the text, we write.
 *
 * The paragraph is only added if one is missing: click twice in the
 * reserve should not stack empty lines in the saved document.
 */
export function focusDocumentEnd(editor: Editor): void {
  if (editor.isDestroyed) return;
  const { doc } = editor.state;
  const last = doc.lastChild;
  const blank = last?.type.name === "paragraph" && last.content.size === 0;
  if (blank) {
    editor.chain().focus("end").run();
    return;
  }
  editor
    .chain()
    .insertContentAt(doc.content.size, { type: "paragraph" })
    .focus("end")
    .run();
}

/**
 * Write AT THE BEGINNING of the document, from the title.
 *
 * Enter at the end of the title is the one-line gesture: it opens the line
 * NEXT, empty, and put the cursor there — the title behaves like the first
 * line of the page even though it is a separate field (see title-bridge.ts). Just
 * going down into the body puts the cursor in front of the text already
 * written, where Enter never opened anything.
 *
 * Same guard as `focusDocumentEnd`, for the same reason: if the document
 * already starts with an empty paragraph, we settle on it instead of stacking one
 * second on each pass.
 */
export function focusDocumentStart(editor: Editor): void {
  if (editor.isDestroyed) return;
  const first = editor.state.doc.firstChild;
  const blank = first?.type.name === "paragraph" && first.content.size === 0;
  if (blank) {
    editor.chain().focus("start").run();
    return;
  }
  editor.chain().insertContentAt(0, { type: "paragraph" }).focus("start").run();
}

/**
 * The position of the block that has this ID — the anchor of a block link, resolved
 * in the DOCUMENT and not in the DOM.
 *
 * The DOM is no longer enough since the blink goes through a decoration
 * (components/pages/block-flash.ts): a decoration is placed on a position,
 * not on an element. And that's also good — an element can be replaced under
 * our feet, a position is remapped.
 */
export function posOfBlockId(editor: Editor, blockId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs?.[BLOCK_ID_ATTRIBUTE] === blockId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * BRING a block to the screen and light it — the full “go there” gesture.
 *
 * The two halves are written together, and that's the whole point: the
 * separating cost two passes. GENTLE scrolling makes the hand feel right away
 * and takes up to a second to arrive, while a CSS animation is running
 * whether we saw her or not — the blinking was burning up her time during the journey and
 * was no longer there on arrival. Visible on a nearby block, invisible on a
 * distant block.
 *
 * Hence the SEC jump. Waiting for arrival would request `scrollend`, which all
 * browsers are not used and which never comes when nothing has scrolled.
 * And it is precisely to find one's bearings after a sharp jump that the blink
 * exists.
 *
 * Makes enough to TURN OFF the blink (see `flashBlockAt`).
 */
export function revealBlock(
  editor: Editor,
  container: HTMLElement,
  pos: number,
  margin: number
): () => void {
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    const delta =
      dom.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      margin;
    container.scrollBy({ top: delta, behavior: "auto" });
  }
  return flashBlockAt(editor, pos);
}

/**
 * The URL of a block: that of the page, plus the block ID in fragment.
 *
 * A fragment and not a parameter: it does not go to the server, does not break any
 * route, and scrolling to the anchor will plug into it (tab ticket
 * Pages). `href` is passed rather than read here so that the function remains
 * testable outside the browser.
 */
export function blockLink(href: string, blockId: string): string {
  const [base] = href.split("#");
  return `${base}#${blockId}`;
}

/** The ID of the first block in the selection — what “copy link” is aiming for. */
export function selectedBlockId(editor: Editor): string | null {
  return selectedBlockIds(editor)[0] ?? null;
}

/** Return the cursor to the document, at the start of the range — what the menu does in
    closing, so that `Escape` doesn't leave focus anywhere. */
export function focusBlockRange(
  editor: Editor,
  range: BlockRange | null
): void {
  if (!range) {
    editor.commands.focus();
    return;
  }
  const { doc } = editor.state;
  const pos = Math.min(range.from + 1, doc.content.size);
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(doc, pos))
  );
  editor.commands.focus();
}
