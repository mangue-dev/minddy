"use client";

// The contextual text toolbar for a selection — on pages, and since MIN-728
// on every editor of the app (descriptions, comments, the notebook). Only a
// page adds the comment action.
//
// Tiptap's BubbleMenu owns positioning and waits 300 ms after the last selection
// update before appearing. That delay keeps the toolbar still while the user is
// extending a selection. Formatting commands and the comment action share the
// same menu, so selecting text produces one stable affordance instead of a
// comment-only bubble followed by a separate editor menu.
//
// Its layout follows Notion's selection card: the block type on top (turn
// into), a grid of inline formats with their shortcuts in the tooltips, then
// the comment row. The block types and the colors open as panels of the same
// card rather than as dropdowns, which would take the editor's focus away.
//
// `onMouseDown.preventDefault()` preserves the ProseMirror selection while a
// toolbar button receives the pointer. Comments anchor to the first top-level
// block containing the selection start, matching block handles and block links.

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { ArrowLeft01Icon, ArrowRight01Icon, CheckIcon, CodeSimpleIcon as Code2, Copy01Icon, Link02Icon, MessageAdd01Icon, TextBoldIcon, TextClearIcon, TextItalicIcon, TextStrikethroughIcon, TextUnderlineIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { isBlockSelection } from "@/components/editor/block-selection";
import { isMarqueeDrawing } from "@/components/editor/block-marquee";
import { posToDOMRect } from "@tiptap/core";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MarkdownLinkEditDialog } from "@/components/markdown-link-menu";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import {
  PAGE_COLORS,
  PAGE_COLOR_ATTRIBUTE,
  activePageColor,
  setPageColor,
  turnIntoItems,
  type PageColor,
  type PageColorKind,
} from "@/components/pages/blocks";
import { turnBlocksInto } from "@/components/pages/block-actions";
import { INLINE_MATH_NODE, MATH_ICON, inlineMathActive, toggleInlineMath } from "@/components/pages/blocks/math";

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";
import { MAX_QUOTE_LENGTH } from "@/lib/page-comments";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { NumoIcon } from "@/components/numo-icon";
import { useAskNumoAboutSelection } from "@/lib/use-ask-numo-about-selection";
import { OVERLAY_COLLISION_PADDING } from "@/components/ui/menu-surface";

/** What clicking on the bubble does: where to anchor, and what we're talking about. */
export interface PageCommentAnchor {
  blockId: string;
  quote?: string;
  /** Open a new composer even when this block already has comments. */
  startNew?: boolean;
}

/** The first level block that contains this position, and its id. */
function anchorBlockId(editor: Editor, pos: number): string | null {
  const resolved = editor.state.doc.resolve(pos);
  // `depth >= 1`: node of depth 1 is the first level block. A
  // selection in a bullet therefore goes back to the list, like everywhere else.
  const node = resolved.depth >= 1 ? resolved.node(1) : null;
  const id = node?.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id ? id : null;
}

/** Comment from the phone's keyboard toolbar: the selected passage, or the
    block under the caret when nothing is selected. */
export function commentAtCaret(editor: Editor, onComment: (anchor: PageCommentAnchor) => void) {
  if (editor.isDestroyed) return;
  const { from, to } = editor.state.selection;
  const blockId = anchorBlockId(editor, from);
  if (!blockId) return;
  const quote = editor.state.doc.textBetween(from, to, " ").trim();
  onComment({ blockId, ...(quote ? { quote: quote.slice(0, MAX_QUOTE_LENGTH) } : {}), startNew: true });
}

const SELECTION_MENU_DELAY_MS = 300;

/** The block-type submenu: its width, and the grace period that lets the
    pointer travel from the row to it. */
const TURN_INTO_WIDTH = 224;
const TURN_INTO_CLOSE_MS = 150;
/** The submenu's gap to the card, and its own padding (its first row level
    with the card's row). */
const TURN_INTO_GAP = 4;
const TURN_INTO_INSET = 8;

/** What counts as another menu taking the screen from the card. */
const OTHER_MENU = '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]';

/** The selection card's plugin key: a "hide" meta on it closes the card. */
const SELECTION_MENU_KEY = "selectionMenu";

export function shouldShowSelectionMenu({ editor }: { editor: Editor }): boolean {
  // Activity can detach the view before a delayed BubbleMenu update runs.
  // Tiptap retains editor state during unmount, but view access is unavailable.
  if (!editor.isInitialized || editor.isDestroyed) return false;
  const { selection } = editor.state;
  const { from, to, empty } = selection;
  return (
    editor.isEditable &&
    editor.view.hasFocus() &&
    !isMarqueeDrawing() &&
    // Text, or ONE whole block (Esc, a drag that reached it): the card's
    // formats, colors and "Turn into" apply to it. Several blocks take the
    // block menu of their handle, which acts on all of them, and the card
    // stays out of the way. A node selection (an image, an equation) has its
    // own controls.
    (selection instanceof TextSelection || (isBlockSelection(selection) && selection.ranges.length === 1)) &&
    !empty &&
    !!editor.state.doc.textBetween(from, to, " ").trim()
  );
}

function ToolbarButton({
  label,
  shortcut,
  active = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: readonly string[];
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <AppTooltip label={label} shortcut={shortcut} side="top">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-foreground",
          "transition-colors hover:bg-control hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active && "bg-control text-foreground",
        )}
      >
        {children}
      </button>
    </AppTooltip>
  );
}

/** A full-width row of the toolbar: the block type, the comment action and
    the entries of its two panels. */
function ToolbarRow({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        // The rows of the app's dropdown menus (components/ui/dropdown-menu.tsx).
        "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
        "transition-colors hover:bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The “A” of a color, painted with the token it places. */
function ColorSwatch({ kind, color }: { kind: PageColorKind; color: PageColor | null }) {
  const attribute = color ? { [PAGE_COLOR_ATTRIBUTE[kind]]: color } : {};
  return (
    <span
      {...attribute}
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded border border-border text-xs font-semibold",
        !color && "text-muted-foreground",
      )}
    >
      A
    </span>
  );
}

// Inset by the card's padding, like the dropdowns' separators.
/**
 * A color's name as its own preview: written in the text color, or on the
 * background color, capitalized (the catalog names are common nouns).
 */
export function PageColorName({ kind, color, label }: {
  kind: PageColorKind;
  color: PageColor | null;
  label: string;
}) {
  const locale = useLocale();
  const attribute = color ? { [PAGE_COLOR_ATTRIBUTE[kind]]: color } : {};
  const name = label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  return (
    <span
      {...attribute}
      className={cn("inline-block max-w-full truncate align-middle", kind === "background" && color && "rounded px-1.5")}
    >
      {name}
    </span>
  );
}

const Separator = () => <span aria-hidden className="-mx-1 my-1 h-px shrink-0 bg-border" />;

/** Marks the toolbar, so a dialog can tell a click on it from a click outside. */
export const SELECTION_TOOLBAR_ATTR = "data-selection-toolbar";

export function PageCommentBubble({
  editor,
  onComment,
  floating = false,
}: {
  editor: Editor;
  /** The comment action; absent outside pages. */
  onComment?: (anchor: PageCommentAnchor) => void;
  /**
   * Attach the toolbar to the document body rather than next to the editor:
   * a comment field or a dialog scrolls, and would clip a toolbar placed
   * above the first line.
   */
  floating?: boolean;
}) {
  const t = useTranslations("Pages");
  const colorName = useTranslations("Categories.colors");
  const tBulk = useTranslations("BulkActions");
  // Absent where Numo is not (a public page, an account without AI).
  const askNumo = useAskNumoAboutSelection();
  const mod = useModKey();
  const [editLinkOpen, setEditLinkOpen] = useState(false);
  // The colors open in place, inside the same card: a dropdown would take
  // the focus, and the toolbar only shows while the editor has it. The block
  // types open as a submenu beside the card, on hover, like a menu's.
  const [panel, setPanel] = useState<"main" | "color">("main");
  // Where the submenu stands, in viewport coordinates, while it is open.
  const [turnInto, setTurnInto] = useState<CSSProperties | null>(null);
  const turnIntoClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnIntoRow = useRef<HTMLDivElement>(null);
  const openTurnInto = (row: HTMLElement) => {
    if (turnIntoClose.current) clearTimeout(turnIntoClose.current);
    // Beside the card, on the side that has room for it, level with the row.
    const card = row.closest(`[${SELECTION_TOOLBAR_ATTR}]`)?.getBoundingClientRect();
    if (!card) return;
    const top = row.getBoundingClientRect().top - TURN_INTO_INSET;
    const room = window.innerWidth - card.right;
    setTurnInto(
      room >= TURN_INTO_WIDTH + OVERLAY_COLLISION_PADDING + TURN_INTO_GAP
        ? { top, left: card.right + TURN_INTO_GAP }
        : { top, right: window.innerWidth - card.left + TURN_INTO_GAP }
    );
  };
  const closeTurnInto = () => {
    if (turnIntoClose.current) clearTimeout(turnIntoClose.current);
    turnIntoClose.current = setTimeout(() => setTurnInto(null), TURN_INTO_CLOSE_MS);
  };
  useEffect(() => () => {
    if (turnIntoClose.current) clearTimeout(turnIntoClose.current);
  }, []);
  useEffect(() => {
    const reset = () => {
      setPanel("main");
      setTurnInto(null);
    };
    editor.on("selectionUpdate", reset);
    editor.on("blur", reset);
    return () => {
      editor.off("selectionUpdate", reset);
      editor.off("blur", reset);
    };
  }, [editor]);
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      underline: current.isActive("underline"),
      math: inlineMathActive(current),
      link: current.isActive("link"),
      // Code takes only colors: the formats do not apply inside it.
      inCode: current.isActive("codeBlock"),
      text: activePageColor(current, "text"),
      background: activePageColor(current, "background"),
      // The block the selection is in: the card re-renders when it moves to
      // another one, or its first row kept naming the previous block.
      block: turnIntoItems(current).find((item) => item.active)?.block.id ?? null,
    }),
  });
  // Only the blocks this editor's catalog holds (a comment has no subpage).
  const blocks = turnIntoItems(editor).filter(({ block }) => editor.schema.nodes[block.nodeName]);
  const current = blocks.find((item) => item.active)?.block;

  const comment = () => {
    if (!editor || editor.isDestroyed) return;
    const { from, to } = editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, " ").trim();
    const blockId = anchorBlockId(editor, from);
    if (!blockId || !quote || !onComment) return;
    onComment({
      blockId,
      quote: quote.slice(0, MAX_QUOTE_LENGTH),
      startNew: true,
    });
    // The quote is taken: the card goes, and does not come back over the
    // comment dialog when the focus returns to the editor.
    editor.commands.setTextSelection(to);
  };

  // The passage goes to the composer as its context; the card closes, as
  // for a comment, and the selection collapses behind it.
  const ask = () => {
    if (!askNumo || editor.isDestroyed) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!text) return;
    askNumo({ text });
    editor.commands.setTextSelection(to);
  };

  // Another menu opening — the block handle's, a picker, a dialog — takes
  // the card's place: the card closes, even though the text keeps its
  // selection. Menus are portaled into <body>, so their arrival is watched
  // there; a tooltip (the card's own) does not count, nor the card's submenu.
  useEffect(() => {
    const opensMenu = (node: globalThis.Node) =>
      node instanceof Element &&
      !node.closest(`[${SELECTION_TOOLBAR_ATTR}]`) &&
      !node.querySelector(`[${SELECTION_TOOLBAR_ATTR}]`) &&
      (node.matches(OTHER_MENU) || !!node.querySelector(OTHER_MENU));
    const observer = new MutationObserver((records) => {
      if (editor.isDestroyed) return;
      if (records.some((record) => [...record.addedNodes].some(opensMenu))) {
        editor.view.dispatch(editor.state.tr.setMeta(SELECTION_MENU_KEY, "hide"));
      }
    });
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, [editor]);

  // A selection rectangle (block-marquee.ts) puts the card aside while it is
  // drawn, as a text drag does, and the card comes back over what it
  // selected on release. The bubble menu only re-reads its rule when the
  // selection changes, so the rectangle's start and end are told to it.
  useEffect(() => {
    let drawing = isMarqueeDrawing();
    const observer = new MutationObserver(() => {
      if (editor.isDestroyed || isMarqueeDrawing() === drawing) return;
      drawing = !drawing;
      const meta = drawing ? "hide" : shouldShowSelectionMenu({ editor }) ? "show" : null;
      if (meta) editor.view.dispatch(editor.state.tr.setMeta(SELECTION_MENU_KEY, meta));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [editor]);

  // A click outside the editor ends the selection, like in any text editor:
  // the card would otherwise stay over a passage nobody is working on. A click
  // in the card itself, or in a menu or dialog it opened (the link dialog),
  // keeps it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (editor.isDestroyed || editor.state.selection.empty) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || editor.view.dom.contains(target)) return;
      // The editor's own chrome — the block handle and `+`, the comment
      // button, its margins — is not the outside: the handle acts on the
      // selected blocks, so pressing it must keep them selected.
      const root = editor.view.dom.closest(".page-editor");
      if (root && root.contains(target)) return;
      // A surface the editor does not live in — the card, a menu, a dialog it
      // opened — keeps the selection. The dialog AROUND the editor (the
      // notebook's sheet) is just more of the outside.
      const surface = target.closest(
        `[${SELECTION_TOOLBAR_ATTR}],[data-floating-surface],[role=dialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper]`,
      );
      if (surface && !surface.contains(editor.view.dom)) return;
      editor.commands.setTextSelection(editor.state.selection.to);
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [editor]);

  // The selection copied as the editor copies it (rich text and plain text):
  // the card keeps the editor's selection, so the browser's copy reads it.
  const copySelection = () => {
    editor.view.focus();
    if (document.execCommand("copy")) toast.success(t("selectionCopied"));
    else {
      const { from, to } = editor.state.selection;
      void navigator.clipboard
        .writeText(editor.state.doc.textBetween(from, to, "\n"))
        .then(() => toast.success(t("selectionCopied")), () => toast.error(t("copyFailed")));
    }
  };

  // The card follows the passage while its pane scrolls (the reference is
  // measured afresh on every update), and closes once the passage has left
  // the visible part of that pane.
  const reference = useMemo(
    () => () => {
      if (editor.isDestroyed || !editor.view.dom.isConnected) return null;
      const { from, to } = editor.state.selection;
      const rect = () => posToDOMRect(editor.view, from, to);
      return { getBoundingClientRect: rect, getClientRects: () => [rect()], contextElement: editor.view.dom };
    },
    [editor]
  );
  // Scrolls are caught in the capture phase on the document: they do not
  // bubble, and the pane an editor ends up in is only known once it is laid
  // out (a retained page, a side panel). Only a scroll of something that
  // contains this editor concerns the card.
  useEffect(() => {
    // One update per frame while the pane scrolls, read once the frame's
    // layout is known: an update read from inside the scroll event itself
    // lands one position behind.
    let frame = 0;
    let scroller: Element | null = null;
    const update = () => {
      frame = 0;
      if (editor.isDestroyed || editor.state.selection.empty || !scroller) return;
      const { from, to } = editor.state.selection;
      const passage = posToDOMRect(editor.view, from, to);
      const visible = scroller === document.documentElement
        ? { top: 0, bottom: window.innerHeight }
        : scroller.getBoundingClientRect();
      const gone = passage.bottom < visible.top || passage.top > visible.bottom;
      editor.view.dispatch(
        editor.state.tr.setMeta(SELECTION_MENU_KEY, gone ? "hide" : "updatePosition")
      );
    };
    const onScroll = (event: Event) => {
      if (editor.isDestroyed || editor.state.selection.empty) return;
      const target = event.target === document ? document.documentElement : event.target;
      if (!(target instanceof Element) || !target.contains(editor.view.dom)) return;
      scroller = target;
      // The block-type submenu stands fixed beside the card: it closes
      // rather than stay behind while the card follows the passage.
      setTurnInto(null);
      if (!frame) frame = requestAnimationFrame(update);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [editor]);

  const colorRows = (kind: PageColorKind) =>
    [null, ...PAGE_COLORS].map((color) => (
      <ToolbarRow key={`${kind}:${color ?? "none"}`} onClick={() => {
        setPageColor(editor, kind, color);
        setPanel("main");
      }}>
        <span className="min-w-0 flex-1">
          <PageColorName kind={kind} color={color} label={color ? colorName(color) : t("colorNone")} />
        </span>
        {active?.[kind] === color && <HugeiconsIcon icon={CheckIcon} className="size-3.5 shrink-0" />}
      </ToolbarRow>
    ));

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey={SELECTION_MENU_KEY}
        updateDelay={SELECTION_MENU_DELAY_MS}
        // Repositioned on every scroll frame rather than after a pause, so it
        // moves with the passage instead of jumping after it.
        resizeDelay={0}
        shouldShow={shouldShowSelectionMenu}
        getReferencedVirtualElement={reference}
        // Kept whole along the line, and flipped under the passage near the
        // top: it stays WITH the passage rather than pinned to the window's
        // edge, and closes when the passage scrolls away (above).
        options={{
          placement: "top-start",
          offset: 8,
          flip: { padding: OVERLAY_COLLISION_PADDING },
          shift: { padding: OVERLAY_COLLISION_PADDING },
        }}
        appendTo={floating ? () => document.body : undefined}
        data-floating-surface
        {...{ [SELECTION_TOOLBAR_ATTR]: "" }}
        className={cn(
          // The surface of the app's dropdown menus.
          "flex w-64 flex-col rounded-xl bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10",
          // On the body, under a modal dialog that sets `pointer-events: none`
          // on it: the toolbar takes its clicks back, like the "/" and "@" menus.
          floating && "pointer-events-auto z-[70]",
        )}
      >
        {panel === "main" ? (
          <>
            {blocks.length > 0 && (
              <>
                <div
                  ref={turnIntoRow}
                  className="relative"
                  onMouseEnter={(event) => openTurnInto(event.currentTarget)}
                  onMouseLeave={closeTurnInto}
                >
                  <ToolbarRow
                    onClick={() => {
                      if (!turnInto && turnIntoRow.current) openTurnInto(turnIntoRow.current);
                    }}
                    className={cn(turnInto && "bg-control")}
                  >
                    {current && <AppIcon icon={current.icon} className="size-4 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{current ? t(current.labelKey) : t("turnInto")}</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0" />
                  </ToolbarRow>
                  {/* Portaled out of the card: the card blurs what is behind
                      it, and a surface inside it could only blur the card's
                      own content — the page would show through, unblurred.
                      React events still reach the wrapper through the portal,
                      so hovering the submenu keeps it open. */}
                  {turnInto
                    ? createPortal(
                        <div
                          role="menu"
                          aria-label={t("turnInto")}
                          data-floating-surface
                          {...{ [SELECTION_TOOLBAR_ATTR]: "" }}
                          onMouseDown={(event) => event.preventDefault()}
                          className="pointer-events-auto fixed z-[71] flex max-h-72 flex-col overflow-y-auto rounded-xl bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10"
                          style={{ ...turnInto, width: TURN_INTO_WIDTH }}
                        >
                          {blocks.map(({ block, active: isCurrent }) => (
                            <ToolbarRow key={block.id} onClick={() => {
                              turnBlocksInto(editor, block);
                              setTurnInto(null);
                            }}>
                              <AppIcon icon={block.icon} className="size-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{t(block.labelKey)}</span>
                              {isCurrent && <HugeiconsIcon icon={CheckIcon} className="size-3.5 shrink-0" />}
                            </ToolbarRow>
                          ))}
                        </div>,
                        document.body
                      )
                    : null}
                </div>
                <Separator />
              </>
            )}
            <div className="grid grid-cols-5 gap-1 px-1 py-0.5">
              <ToolbarButton label={t("color")} onClick={() => setPanel("color")}>
                <ColorSwatch kind="text" color={active?.text ?? null} />
              </ToolbarButton>
              {active?.inCode ? null : (
                <>
                  <ToolbarButton
                    label={t("selectionBold")}
                    shortcut={[mod, "B"]}
                    active={active?.bold}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  >
                    <HugeiconsIcon icon={TextBoldIcon} className="size-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t("selectionItalic")}
                    shortcut={[mod, "I"]}
                    active={active?.italic}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  >
                    <HugeiconsIcon icon={TextItalicIcon} className="size-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t("selectionUnderline")}
                    shortcut={[mod, "U"]}
                    active={active?.underline}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                  >
                    <HugeiconsIcon icon={TextUnderlineIcon} className="size-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t("selectionStrike")}
                    shortcut={[mod, "⇧", "S"]}
                    active={active?.strike}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                  >
                    <HugeiconsIcon icon={TextStrikethroughIcon} className="size-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t("selectionCode")}
                    shortcut={[mod, "E"]}
                    active={active?.code}
                    onClick={() => editor.chain().focus().toggleCode().run()}
                  >
                    <AppIcon icon={Code2} className="size-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={active?.link ? t("selectionEditLink") : t("selectionAddLink")}
                    active={active?.link}
                    onClick={() => setEditLinkOpen(true)}
                  >
                    <HugeiconsIcon icon={Link02Icon} className="size-4" />
                  </ToolbarButton>
                  {editor.schema.nodes[INLINE_MATH_NODE] ? (
                    <ToolbarButton
                      label={t("mathInline")}
                      active={active?.math}
                      onClick={() => toggleInlineMath(editor)}
                    >
                      <HugeiconsIcon icon={MATH_ICON} className="size-4" />
                    </ToolbarButton>
                  ) : null}
                  <ToolbarButton
                    label={t("selectionClearFormatting")}
                    onClick={() => editor.chain().focus().unsetAllMarks().run()}
                  >
                    <HugeiconsIcon icon={TextClearIcon} className="size-4" />
                  </ToolbarButton>
                </>
              )}
              <ToolbarButton label={t("selectionCopy")} shortcut={[mod, "C"]} onClick={copySelection}>
                <HugeiconsIcon icon={Copy01Icon} className="size-4" />
              </ToolbarButton>
            </div>
            {onComment || askNumo ? <Separator /> : null}
            {askNumo ? (
              <ToolbarRow onClick={ask}>
                <NumoIcon animated={false} className="size-4 shrink-0" />
                <span className="truncate">{tBulk("askNumo")}</span>
              </ToolbarRow>
            ) : null}
            {onComment ? (
              <ToolbarRow onClick={comment}>
                <HugeiconsIcon icon={MessageAdd01Icon} className="size-4 shrink-0" />
                <span className="truncate">{t("commentSelection")}</span>
              </ToolbarRow>
            ) : null}
          </>
        ) : (
          <>
            <ToolbarRow onClick={() => setPanel("main")}>
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4 shrink-0" />
              <span className="truncate">{t("color")}</span>
            </ToolbarRow>
            <Separator />
            <div className="max-h-72 overflow-y-auto">
              <div className="px-2 py-1 text-xs font-medium">{t("colorText")}</div>
              {colorRows("text")}
              <Separator />
              <div className="px-2 py-1 text-xs font-medium">{t("colorBackground")}</div>
              {colorRows("background")}
            </div>
          </>
        )}
      </BubbleMenu>
      <MarkdownLinkEditDialog
        editor={editor}
        open={editLinkOpen}
        onOpenChange={setEditLinkOpen}
      />
    </>
  );
}
