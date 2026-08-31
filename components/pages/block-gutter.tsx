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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { GripVertical, Plus } from "lucide-react";
import { cn } from "mangue-ui";
import { BlockMenu } from "@/components/pages/block-menu";
import type { PageCommentAnchor } from "@/components/pages/page-comment-bubble";
import { COMMENTED_BLOCK_CLASS } from "@/components/pages/block-comments";
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

/** Side of a gutter button (`size-6`), in pixels — it is used for calculation
    centering on the first line of the block, which has no CSS equivalent. */
const BUTTON_SIZE = 24;

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
  "flex size-6 items-center justify-center rounded-md text-muted-foreground/60",
  "transition-colors hover:bg-muted hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

export function BlockGutter({
  editor,
  onComment,
}: {
  editor: Editor;
  onComment?: (anchor: PageCommentAnchor) => void;
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
      const box = styledBox(dom);
      const style = getComputedStyle(box);
      const commented =
        dom.classList.contains(COMMENTED_BLOCK_CLASS) ||
        box.classList.contains(COMMENTED_BLOCK_CLASS);
      element.style.transform = commented
        ? `translateX(-${COMMENTED_GUTTER_SHIFT}px)`
        : "";
      // A code block starts with custom chrome rather than a text line. Center
      // the gutter on the actual language trigger so changes to the header's
      // padding, button size, or border radius cannot leave the controls behind.
      const languageTrigger = box.querySelector(
        ".code-block-node-language-trigger"
      );
      if (languageTrigger instanceof HTMLElement) {
        const blockRect = dom.getBoundingClientRect();
        const triggerRect = languageTrigger.getBoundingClientRect();
        const offset =
          triggerRect.top -
          blockRect.top +
          (triggerRect.height - BUTTON_SIZE) / 2;
        element.style.marginTop = `${Math.max(0, Math.round(offset))}px`;
        return;
      }
      // Text does not always start at the block's top edge: quotes, callouts,
      // and other framed blocks carry their own padding or border. Include
      // those insets so the gutter stays centered on their first line.
      const inset =
        parseFloat(style.paddingTop || "0") +
        parseFloat(style.borderTopWidth || "0");
      // `line-height: normal` cannot be read in pixels: we fall back on the
      // font height, which is still much fairer than zero.
      const parsed = parseFloat(style.lineHeight);
      const lineHeight = Number.isFinite(parsed)
        ? parsed
        : parseFloat(style.fontSize || "0") * 1.5;
      const offset = inset + (lineHeight - BUTTON_SIZE) / 2;
      element.style.marginTop = `${Math.max(0, Math.round(offset))}px`;
    },
    [editor]
  );

  // As long as the menu is open, the handle should not disappear under the
  // mouse going to the menu. The extension reads this flag in a meta of
  // transaction — no need to mount its extension to give it to it.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.commands.setMeta("lockDragHandle", menuOpen);
  }, [editor, menuOpen]);

  const openMenuAt = useCallback((rect: DOMRect) => {
    setAnchor({ top: rect.top, left: rect.left });
    setMenuOpen(true);
  }, []);

  /** The keyboard: ⇧F10 (or the “menu” key) opens the menu on the block where is
      the cursor, anchored on this block. */
  useEffect(() => {
    if (editor.isDestroyed) return;
    const dom = editor.view.dom;
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
        onElementDragStart={() => setDragging(true)}
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
          className="flex items-center justify-end gap-0.5 pr-1 transition-transform"
        >
          <Tooltip delayDuration={TOOLTIP_DELAY_MS} disableHoverableContent>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("insertBlock")}
                className={BUTTON}
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
                <Plus className="size-4" />
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
                className={cn(
                  BUTTON,
                  dragging ? "cursor-grabbing" : "cursor-pointer"
                )}
                // NO `preventDefault` on the `mousedown`, and that's it
                // subject: native drag IS the default action of
                // `mousedown`. The handle lives in a `div[draggable]` placed by
                // the extension, which listens for `dragstart` on it; A
                // `preventDefault` on the button that fills it prevented the
                // browser to initiate the drag, and the handle no longer knew
                // than click. The selection fears nothing: it lives
                // in the ProseMirror state, which the loss of DOM focus does not affect
                // not — it is `selectBlockFromHandle` who reads it and puts it back.
                onClick={(event) => {
                  const { pos } = hovered.current;
                  if (pos < 0) return;
                  if (!selectBlockFromHandle(editor, pos, event.shiftKey))
                    return;
                  openMenuAt(event.currentTarget.getBoundingClientRect());
                }}
              >
                <GripVertical className="size-4" />
              </button>
            </TooltipTrigger>
            {/* A handle that does TWO things: clicking opens the menu,
                drag moves. Tooltip says both, if not half
                that we have not tried does not exist. */}
            <TooltipContent side="top">{t("dragHandleHint")}</TooltipContent>
          </Tooltip>
        </div>
      </DragHandle>

      <BlockMenu
        editor={editor}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onComment={onComment}
      >
        {/* The menu anchor: a dot, not a button. It exists so that the
            menu has where to put it when you open it with the keyboard, where the handle
            is not achievable. negative `tabIndex` — a point of 0 pixels does not
            should not be a tab step. */}
        <span aria-hidden tabIndex={-1} style={anchorStyle} />
      </BlockMenu>
    </>
  );
}
