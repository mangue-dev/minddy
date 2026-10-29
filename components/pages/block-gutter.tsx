"use client";

// The MARGIN of a page block: the `+` and the handle, on hover.
//
// It is the gesture that everyone has learned elsewhere, and whose absence is
// note before any other quality of the editor. It consists of three pieces:
//
// - `DragHandle` (@tiptap/extension-drag-handle-react) carries hover,
// positioning and drag and drop, including children. She targets the blocks
// FIRST LEVEL only (no `nested`), and it's a choice, not a
// oversight: the register calls the list “block”, not the item; the leaflet,
// not its content. `nested` added a SECOND handle as soon as we hovered
// the text of a quote or an item — two handles with two x-coordinates
// different for a single block in the sense of the product -, and on a list it
// was positioned on the indentation of the item, therefore on top of the text. All
// menu actions ⋯ already operate on the first level block
// (`blocksIn`, block-actions.ts): the handle now says the same thing;
// - `+` inserts an empty paragraph BELOW and opens the “/” menu inside
// (`alt`-click: above). The `+` is not a “paragraph” button, it is
// the catalog entry;
// - the handle, clicked, selects the block and opens the menu ⋯. ⇧-click expands
// the selection from the block already selected, and — this is what was missing —
// a simple click on a block ALREADY included in a multi-block selection
// keep intact: sweep three blocks with the mouse then fetch the
// handle no longer brings them back to just one (`selectBlockFromHandle`).
//
// The keyboard goes through the SAME anchor. The handle lives in a portal that
// the extension hides by `visibility` off hover: nothing that is inside
// cannot be reached on the keyboard, whatever you put there like `tabIndex`. We don't
// so don't tinker with the handle - we give the menu a second anchor, a point
// placed on the current block, and the standard menu opening key
// contextual (⇧F10, and the “menu” key on keyboards that have one) there
// brings. Same menu, same actions, without mouse.

import { onEditorDom } from "@/components/editor/editor-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, DragDropVerticalIcon, MessageAdd01Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { cn } from "@/lib/utils";
import { scrollPane } from "@/lib/scroll-pane";
import { BlockMenu } from "@/components/pages/block-menu";
import type { PageCommentAnchor } from "@/components/pages/page-comment-bubble";
import { COMMENTED_BLOCK_CLASS } from "@/components/pages/block-comments";
import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";
import { trackBlockDrag } from "@/components/pages/block-drag";
import {
  GUTTER_WIDTH,
  blockRange,
  insertBlockAround,
  selectBlockFromHandle,
  styledBox,
} from "@/components/pages/block-actions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Frozen at the module level: the `DragHandle` component remounts its plugin as soon as
    that this object changes identity. */
const POSITION = { placement: "left-start", strategy: "absolute" } as const;

/** Side of the handle, the taller gutter button, in pixels: its 24 px icon
    (the 24 px body line height) and a 2 px padding. It is used to centre the
    buttons on the block's first line, which has no CSS equivalent. */
const BUTTON_SIZE = 28;

/** The handle and the smaller `+` beside it, side by side, in pixels. */
const BUTTONS_WIDTH = 24 + BUTTON_SIZE;

/** The gap between the buttons and the text: `GUTTER_GAP_MIN` always, plus
    up to `GUTTER_GAP_EXTRA` while the pane leaves the room for it. */
const GUTTER_GAP_MIN = 4;
const GUTTER_GAP_EXTRA = 10;

/** The margin the buttons keep from the pane's edge (a side panel's border):
    the gap to the text gives way first. */
const GUTTER_EDGE_MIN = 8;

/** The comment button on the right of a hovered page block, and its gap to
    the text. It lives in the column's right reserve (`app-desktop:pr-10`). */
const COMMENT_BUTTON_SIZE = 24;
const COMMENT_BUTTON_GAP = 6;

/**
 * Where the pointer asks for which button. Beside the text, up to
 * `HOVER_MARGIN` away from it, the left margin shows the gutter and the right
 * one the comment button; over the text, its left `GUTTER_SHARE` shows the
 * gutter and the rest the comment button. Never both at once: an editor
 * without comments shows nothing on the right part.
 */
const HOVER_MARGIN = 100;
const GUTTER_SHARE = 0.7;
type HoverZone = "gutter" | "comment" | "none";

/** How long the buttons take to fade in beside a newly hovered block. */
const GUTTER_FADE_MS = 120;

/** Keep both gutter buttons clear of a commented block's left edge. */
const COMMENTED_GUTTER_SHIFT = 12;

/**
 * Gutter tooltips wait before appearing.
 *
 * Since ALL the margin shows the chrome, the mouse moving down the
 * along the column — to go elsewhere, to read — crosses both
 * buttons of each block as you pass. Without delay, two tooltips appear
 * per block crossed, across the text that we are reading.
 *
 * `disableHoverableContent` finishes the job: the tooltip does not hover,
 * it therefore cannot retain a pointer that has already left. Same deadline and same
 * reason that sidebar (`TOOLTIP_DELAY_MS`, components/app-sidebar.tsx)
 * — two surfaces that we cross more often than we aim at.
 */
const TOOLTIP_DELAY_MS = 600;

const BUTTON = cn(
  "flex items-center justify-center rounded-md p-0.5 text-muted-foreground/60",
  "transition-colors hover:bg-muted hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

/**
 * Where a `position: fixed` descendant of `element` is measured from: the
 * viewport, or the nearest ancestor that establishes a containing block for
 * fixed elements (a transform or translate/scale/rotate, a filter, a
 * perspective, `contain`, or
 * `will-change` on one of them).
 */
export function fixedContainingBlockOffset(element: Element | null): { top: number; left: number } {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      (style.transform && style.transform !== "none") ||
      // Tailwind 4 translates and scales through the individual properties,
      // which establish the same containing block.
      (style.translate && style.translate !== "none") ||
      (style.scale && style.scale !== "none") ||
      (style.rotate && style.rotate !== "none") ||
      (style.filter && style.filter !== "none") ||
      (style.perspective && style.perspective !== "none") ||
      /paint|layout|strict|content/.test(style.contain ?? "") ||
      /transform|filter|perspective/.test(style.willChange ?? "")
    ) {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    }
  }
  return { top: 0, left: 0 };
}

/**
 * How far below a block's top edge its buttons start, so they sit centred on
 * the block's FIRST LINE — or on a code block's language picker, its first
 * row. Read from the DOM: it follows the block's typography, insets and
 * borders without a value written here.
 */
function firstLineOffset(dom: HTMLElement): number {
  const box = styledBox(dom);
  const languageTrigger = box.querySelector(".code-block-node-language-trigger");
  if (languageTrigger instanceof HTMLElement) {
    const blockRect = dom.getBoundingClientRect();
    const triggerRect = languageTrigger.getBoundingClientRect();
    return Math.round(triggerRect.top - blockRect.top + (triggerRect.height - BUTTON_SIZE) / 2);
  }
  const style = getComputedStyle(box);
  // Quotes, callouts and other framed blocks carry their own padding or border.
  const inset = parseFloat(style.paddingTop || "0") + parseFloat(style.borderTopWidth || "0");
  // `line-height: normal` cannot be read in pixels: the font height is still
  // much fairer than zero.
  const parsed = parseFloat(style.lineHeight);
  const lineHeight = Number.isFinite(parsed) ? parsed : parseFloat(style.fontSize || "0") * 1.5;
  // The buttons are taller than a line of body text: centred on it, they rise
  // above the block's top, so the offset may be negative.
  return Math.round(inset + (lineHeight - BUTTON_SIZE) / 2);
}

export function BlockGutter({
  editor,
  onComment,
  blockLinks = true,
}: {
  editor: Editor;
  onComment?: (anchor: PageCommentAnchor) => void;
  /** Offer “Copy link to block”: only where the document has an address. */
  blockLinks?: boolean;
}) {
  const t = useTranslations("Pages");

  // The block hovered over, in ref: it changes with each mouse movement, and a
  // state would make it re-render the entire editor for nothing.
  const hovered = useRef<{ node: Node | null; pos: number }>({
    node: null,
    pos: -1,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The menu anchor, in screen coordinates: the handle when clicked
  // above, the current block when you get to the keyboard.
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  /**
   * The gutter fits on the FIRST LINE of the block, not on its high edge.
   *
   * `DragHandle` places its portal at the top of the block it hovers over (`left-start`).
   * In a paragraph, a line is approximately the height of the buttons and
   * no one sees the difference; on a title, the line is double, and
   * the handle is visibly floating too high. We catch up by centering the
   * buttons on the ACTUAL row height of the block — read from the DOM, because
   * that it depends on the class of the block and that no value written here
   * would follow a typography change.
   *
   * Written directly in the style rather than passed through a state: the block
   * hovered over changes with each mouse movement, and a React rendering by
   * movement would re-render the entire editor.
   */
  const gutter = useRef<HTMLDivElement>(null);
  const shownAt = useRef<HTMLElement | null>(null);

  // The comment button mirrors the gutter on the RIGHT of the block, in
  // pages only. It is portaled next to the handle, in the drag handle's own
  // wrapper (which scrolls with the document), and placed from the pointer
  // itself rather than from the handle's hovered block, since it answers in
  // the right margin too. A block that already has comments shows its count
  // badge there instead, which opens its thread.
  const commentButton = useRef<HTMLButtonElement>(null);
  const commentTarget = useRef<Node | null>(null);
  // While the comment button is hovered, its block is painted as if it were
  // selected, so the button says which block it comments on. An overlay in
  // the same wrapper, not a class on the block: ProseMirror owns that DOM.
  const commentPreview = useRef<HTMLDivElement>(null);
  const [commentHost, setCommentHost] = useState<HTMLElement | null>(null);
  // The last placement asked for, replayed once the button is mounted: the
  // first hover finds the host, and the button only exists after it.
  const lastComment = useRef<[HTMLElement | null, Node | null]>([null, null]);
  const placeComment = useCallback(
    (dom: HTMLElement | null, node: Node | null) => {
      const button = commentButton.current;
      const handle = gutter.current?.parentElement;
      if (!onComment) return;
      lastComment.current = [dom, node];
      if (!commentHost && handle?.parentElement) setCommentHost(handle.parentElement);
      if (!button) return;
      const parent = handle?.offsetParent;
      const commented =
        !!dom &&
        (dom.classList.contains(COMMENTED_BLOCK_CLASS) ||
          styledBox(dom).classList.contains(COMMENTED_BLOCK_CLASS));
      const preview = commentPreview.current;
      if (!dom || !node || commented || !(parent instanceof HTMLElement)) {
        commentTarget.current = null;
        button.dataset.shown = "false";
        if (preview) preview.dataset.shown = "false";
        return;
      }
      commentTarget.current = node;
      const block = dom.getBoundingClientRect();
      const frame = parent.getBoundingClientRect();
      if (preview) {
        preview.style.top = `${Math.round(block.top - frame.top + parent.scrollTop)}px`;
        preview.style.left = `${Math.round(block.left - frame.left + parent.scrollLeft)}px`;
        preview.style.width = `${Math.round(block.width)}px`;
        preview.style.height = `${Math.round(block.height)}px`;
      }
      // Like the gutter, a little further from the text where the pane
      // leaves the room for it.
      const room = scrollPane(dom).getBoundingClientRect().right - block.right;
      const gap =
        COMMENT_BUTTON_GAP +
        Math.max(0, Math.min(GUTTER_GAP_EXTRA, room - COMMENT_BUTTON_SIZE - COMMENT_BUTTON_GAP - GUTTER_EDGE_MIN));
      const top =
        block.top - frame.top + parent.scrollTop + firstLineOffset(dom) + (BUTTON_SIZE - COMMENT_BUTTON_SIZE) / 2;
      const left = block.right - frame.left + parent.scrollLeft + Math.floor(gap);
      button.style.top = `${Math.round(top)}px`;
      button.style.left = `${Math.round(left)}px`;
      button.dataset.shown = "true";
    },
    [onComment, commentHost]
  );
  useEffect(() => {
    if (commentHost) placeComment(...lastComment.current);
  }, [commentHost, placeComment]);

  // The hover zones (HOVER_MARGIN, GUTTER_SHARE): one listener on the
  // document, as the right margin lies outside the editor. The zone is
  // written on the editor's root, where app/globals.css hides the gutter
  // outside its zone; the comment button is placed here.
  const zone = useRef<HoverZone>("none");
  useEffect(() => {
    if (editor.isDestroyed) return;
    const setZone = (root: HTMLElement, next: HoverZone) => {
      if (zone.current === next && root.dataset.hoverZone === next) return;
      zone.current = next;
      root.dataset.hoverZone = next;
    };
    const onMove = (event: MouseEvent) => {
      if (editor.isDestroyed || menuOpen || dragging) return;
      const dom = editor.view.dom;
      const root = dom.closest<HTMLElement>(".page-editor");
      if (!root) return;
      const target = event.target instanceof Element ? event.target : null;
      // On a button itself, its own zone holds.
      if (target?.closest("[data-block-comment-button]")) return setZone(root, "comment");
      if (gutter.current && target && gutter.current.contains(target)) return setZone(root, "gutter");
      const box = dom.getBoundingClientRect();
      const style = getComputedStyle(dom);
      const left = box.left + (parseFloat(style.paddingLeft) || 0);
      const right = box.right - (parseFloat(style.paddingRight) || 0);
      const { clientX: x, clientY: y } = event;
      let next: HoverZone = "none";
      if (y >= box.top && y <= box.bottom) {
        if (x < left) next = left - x <= HOVER_MARGIN ? "gutter" : "none";
        else if (x > right) next = x - right <= HOVER_MARGIN ? "comment" : "none";
        else next = x < left + (right - left) * GUTTER_SHARE ? "gutter" : "comment";
      }
      setZone(root, next);
      if (next !== "comment" || !onComment) {
        placeComment(null, null);
        return;
      }
      const hit = editor.view.posAtCoords({ left: Math.min(Math.max(x, left + 2), right - 2), top: y });
      if (!hit) return placeComment(null, null);
      const $pos = editor.state.doc.resolve(hit.inside >= 0 ? hit.inside : hit.pos);
      const node = $pos.depth >= 1 ? $pos.node(1) : $pos.nodeAfter;
      const before = $pos.depth >= 1 ? $pos.before(1) : $pos.pos;
      const blockDom = node ? editor.view.nodeDOM(before) : null;
      placeComment(blockDom instanceof HTMLElement ? blockDom : null, node ?? null);
    };
    const onLeave = () => {
      const root = editor.isDestroyed ? null : editor.view.dom.closest<HTMLElement>(".page-editor");
      if (root) setZone(root, "none");
      placeComment(null, null);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [editor, onComment, placeComment, menuOpen, dragging]);

  const onNodeChange = useCallback(
    ({ node, pos }: { node: Node | null; pos: number }) => {
      hovered.current = { node, pos };
      const element = gutter.current;
      if (!element || pos < 0 || editor.isDestroyed) return;
      const dom = editor.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) {
        // No measurable block: we RESET to zero rather than leaving the
        // offset of the previous block, which would then follow the mouse from block to block
        // block without ever corresponding to the one below.
        element.style.marginTop = "0px";
        element.style.transform = "";
        return;
      }
      // A new block: the buttons fade in beside it rather than jump there.
      // Showing and hiding the whole handle fades through app/globals.css.
      if (shownAt.current !== dom) {
        shownAt.current = dom;
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          element.animate?.([{ opacity: 0 }, { opacity: 1 }], {
            duration: GUTTER_FADE_MS,
            easing: "ease-out",
          });
        }
      }
      // The buttons stand a little away from the text, unless the pane is
      // too narrow on the left for that (a side panel): then they move
      // closer to the text rather than to the pane's edge.
      const room =
        dom.getBoundingClientRect().left -
        scrollPane(dom).getBoundingClientRect().left;
      const extra = Math.max(
        0,
        Math.min(GUTTER_GAP_EXTRA, room - BUTTONS_WIDTH - GUTTER_GAP_MIN - GUTTER_EDGE_MIN)
      );
      element.style.paddingRight = `${GUTTER_GAP_MIN + Math.floor(extra)}px`;
      const box = styledBox(dom);
      const commented =
        dom.classList.contains(COMMENTED_BLOCK_CLASS) ||
        box.classList.contains(COMMENTED_BLOCK_CLASS);
      element.style.transform = commented
        ? `translateX(-${COMMENTED_GUTTER_SHIFT}px)`
        : "";
      element.style.marginTop = `${firstLineOffset(dom)}px`;
    },
    [editor]
  );

  // While a block is dragged, every place it passes over answers "move":
  // ProseMirror's own dragover accepts the drop without naming an effect.
  useEffect(() => {
    if (!dragging) return;
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    window.addEventListener("dragover", onDragOver, true);
    return () => window.removeEventListener("dragover", onDragOver, true);
  }, [dragging]);

  // As long as the menu is open, the handle should not disappear under the
  // mouse going to the menu. The extension reads this flag in a meta of
  // transaction — no need to mount its extension to give it to it.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.commands.setMeta("lockDragHandle", menuOpen);
  }, [editor, menuOpen]);

  const anchorRef = useRef<HTMLSpanElement>(null);
  const openMenuAt = useCallback((rect: DOMRect) => {
    // `position: fixed` is relative to the viewport only while no ancestor is
    // transformed: inside a dialog (the notebook, MIN-728) it is relative to
    // the dialog, and viewport coordinates put the menu beside the block.
    const offset = fixedContainingBlockOffset(anchorRef.current);
    setAnchor({ top: rect.top - offset.top, left: rect.left - offset.left });
    setMenuOpen(true);
  }, []);

  /** The keyboard: ⇧F10 (or the “menu” key) opens the menu on the block where is
      the cursor, anchored on this block. */
  useEffect(() => {
    if (editor.isDestroyed) return;
    // The view may not be mounted yet, or may be remounted (MIN-728).
    return onEditorDom(editor, (dom) => {
      const onKeyDown = (event: KeyboardEvent) => {
        const wanted =
          event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
        if (!wanted) return;
        const range = blockRange(editor);
        if (!range) return;
        event.preventDefault();
        const node = editor.view.nodeDOM(range.from);
        const element =
          node instanceof HTMLElement ? node : (node?.parentElement ?? dom);
        openMenuAt(element.getBoundingClientRect());
      };
      dom.addEventListener("keydown", onKeyDown);
      return () => dom.removeEventListener("keydown", onKeyDown);
    });
  }, [editor, openMenuAt]);

  const anchorStyle = useMemo(
    () => ({
      position: "fixed" as const,
      top: anchor.top,
      left: anchor.left,
      width: 0,
      height: 0,
    }),
    [anchor]
  );

  return (
    <>
      <DragHandle
        editor={editor}
        computePositionConfig={POSITION}
        onNodeChange={onNodeChange}
        onElementDragStart={(event) => {
          // A block drag MOVES the block. Left unset, the drag allows every
          // effect and the browser shows its "copy" cursor (a +) over the text.
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          setDragging(true);
        }}
        onElementDragEnd={() => setDragging(false)}
      >
        {/* The width is WRITTEN, not deduced from the content: it is the same
            value that the rule of app/globals.css which extends the surface of
            editor hover to under the gutter. One more button here
            would visibly overflow from this band — which is exactly the
            signal that is necessary, rather than a gutter wider than the area
            which makes it appear. */}
        <div
          ref={gutter}
          style={{ width: GUTTER_WIDTH }}
          className="flex items-center justify-end pr-1 transition-transform"
        >
          <Tooltip delayDuration={TOOLTIP_DELAY_MS} disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("insertBlock")}
                className={cn(BUTTON, "size-6")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  const { pos } = hovered.current;
                  if (pos < 0) return;
                  insertBlockAround(
                    editor,
                    pos,
                    event.altKey ? "above" : "below"
                  );
                }}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-5" />
              </button>
            </TooltipTrigger>
            {/* The gesture AND its variant: `alt` inserts above, which none
                icon can only say and no one guesses. */}
            <TooltipContent side="top">{t("insertBlockHint")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={TOOLTIP_DELAY_MS} disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("blockMenu")}
                // The grab cursor says a drag is under way, not that one is
                // possible: hovering keeps the plain cursor of a button.
                className={cn(BUTTON, "size-7", dragging && "cursor-grabbing")}
                // The press is tracked by the page (block-drag.ts), not handed
                // to the browser's native drag: during a native drag the
                // browser owns the cursor and shows its text cursor, never
                // the grab cursor. `preventDefault` keeps the native drag
                // from starting; below the drag threshold the press stays a
                // click, which opens the menu.
                onMouseDown={(event) => {
                  if (event.button !== 0) return;
                  const { pos } = hovered.current;
                  if (pos < 0) return;
                  event.preventDefault();
                  trackBlockDrag(editor, pos, event.nativeEvent, setDragging);
                }}
                onClick={(event) => {
                  const { pos } = hovered.current;
                  if (pos < 0) return;
                  if (!selectBlockFromHandle(editor, pos, event.shiftKey))
                    return;
                  // Anchored at the gutter's left edge (the `+`), so the menu,
                  // opening to the left, covers neither button.
                  const handle = event.currentTarget.getBoundingClientRect();
                  const first = gutter.current?.querySelector("button")?.getBoundingClientRect();
                  openMenuAt(first ? new DOMRect(first.left, handle.top, 0, handle.height) : handle);
                }}
              >
                {/* Filled dots: the icon draws each as a stroked ring, which leaves a
                    hole in its centre at this size. */}
                <HugeiconsIcon icon={DragDropVerticalIcon} className="size-6 [&_path]:fill-current" />
              </button>
            </TooltipTrigger>
            {/* A handle that does TWO things: clicking opens the menu,
                drag moves. Tooltip says both, if not half
                that we have not tried does not exist. */}
            <TooltipContent side="top">{t("dragHandleHint")}</TooltipContent>
          </Tooltip>
        </div>
      </DragHandle>

      {onComment && commentHost
        ? createPortal(
            <>
            <div ref={commentPreview} aria-hidden data-block-comment-preview="" data-shown="false" />
            <Tooltip delayDuration={TOOLTIP_DELAY_MS} disableHoverableContent>
              <TooltipTrigger asChild>
                <button
                  ref={commentButton}
                  type="button"
                  aria-label={t("commentBlock")}
                  data-block-comment-button=""
                  onMouseEnter={() => {
                    if (commentPreview.current) commentPreview.current.dataset.shown = "true";
                  }}
                  onMouseLeave={() => {
                    if (commentPreview.current) commentPreview.current.dataset.shown = "false";
                  }}
                  data-shown="false"
                  className={cn(BUTTON, "size-6")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const blockId = commentTarget.current?.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
                    if (typeof blockId === "string" && blockId) onComment({ blockId, startNew: true });
                  }}
                >
                  <HugeiconsIcon icon={MessageAdd01Icon} className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("commentBlock")}</TooltipContent>
            </Tooltip>
            </>,
            commentHost
          )
        : null}

      <BlockMenu
        editor={editor}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onComment={onComment}
        blockLinks={blockLinks}
      >
        {/* The menu anchor: a dot, not a button. It exists so that the
            menu has where to put it when you open it with the keyboard, where the handle
            is not achievable. negative `tabIndex` — a point of 0 pixels does not
            should not be a tab step. */}
        <span ref={anchorRef} aria-hidden tabIndex={-1} style={anchorStyle} />
      </BlockMenu>
    </>
  );
}
