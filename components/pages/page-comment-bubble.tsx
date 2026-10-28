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
import { ArrowLeft01Icon, ArrowRight01Icon, CheckIcon, CodeSimpleIcon as Code2, Link02Icon, MessageAdd01Icon, TextBoldIcon, TextClearIcon, TextItalicIcon, TextStrikethroughIcon, Unlink01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
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

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";
import { MAX_QUOTE_LENGTH } from "@/lib/page-comments";
import { AppTooltip } from "@/components/ui/app-tooltip";

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

export function shouldShowSelectionMenu({ editor }: { editor: Editor }): boolean {
  // Activity can detach the view before a delayed BubbleMenu update runs.
  // Tiptap retains editor state during unmount, but view access is unavailable.
  if (!editor.isInitialized || editor.isDestroyed) return false;
  const { selection } = editor.state;
  const { from, to, empty } = selection;
  return (
    editor.isEditable &&
    editor.view.hasFocus() &&
    selection instanceof TextSelection &&
    !empty &&
    !editor.isActive("codeBlock") &&
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
          "flex size-8 items-center justify-center rounded-md text-foreground/80",
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
  const mod = useModKey();
  const [editLinkOpen, setEditLinkOpen] = useState(false);
  // The block type and the colors open in place, inside the same card: a
  // dropdown would take the focus, and the toolbar only shows while the
  // editor has it.
  const [panel, setPanel] = useState<"main" | "blocks" | "color">("main");
  useEffect(() => {
    const reset = () => setPanel("main");
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
      link: current.isActive("link"),
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

  // A click outside the editor ends the selection, like in any text editor:
  // the card would otherwise stay over a passage nobody is working on. A click
  // in the card itself, or in a menu or dialog it opened (the link dialog),
  // keeps it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (editor.isDestroyed || editor.state.selection.empty) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || editor.view.dom.contains(target)) return;
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
        updateDelay={SELECTION_MENU_DELAY_MS}
        shouldShow={shouldShowSelectionMenu}
        // Shifted on both axes so the whole card stays in the window, even
        // when the selected passage itself runs out of it.
        options={{ placement: "top-start", offset: 8, flip: { padding: 8 }, shift: { padding: 8, crossAxis: true } }}
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
                <ToolbarRow onClick={() => setPanel("blocks")}>
                  {current && <AppIcon icon={current.icon} className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{current ? t(current.labelKey) : t("turnInto")}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />
                </ToolbarRow>
                <Separator />
              </>
            )}
            <div className="grid grid-cols-5 gap-1 px-1 py-0.5">
              <ToolbarButton label={t("color")} onClick={() => setPanel("color")}>
                <ColorSwatch kind="text" color={active?.text ?? null} />
              </ToolbarButton>
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
              {active?.link ? (
                <ToolbarButton
                  label={t("selectionRemoveLink")}
                  onClick={() =>
                    editor.chain().focus().extendMarkRange("link").unsetLink().run()
                  }
                >
                  <HugeiconsIcon icon={Unlink01Icon} className="size-4" />
                </ToolbarButton>
              ) : null}
              <ToolbarButton
                label={t("selectionClearFormatting")}
                onClick={() => editor.chain().focus().unsetAllMarks().run()}
              >
                <HugeiconsIcon icon={TextClearIcon} className="size-4" />
              </ToolbarButton>
            </div>
            {onComment ? (
              <>
                <Separator />
                <ToolbarRow onClick={comment}>
                  <HugeiconsIcon icon={MessageAdd01Icon} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{t("commentSelection")}</span>
                </ToolbarRow>
              </>
            ) : null}
          </>
        ) : (
          <>
            <ToolbarRow onClick={() => setPanel("main")} className="text-muted-foreground">
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4 shrink-0" />
              <span className="truncate">{panel === "blocks" ? t("turnInto") : t("color")}</span>
            </ToolbarRow>
            <Separator />
            <div className="max-h-72 overflow-y-auto">
              {panel === "blocks"
                ? blocks.map(({ block, active: isCurrent }) => (
                    <ToolbarRow key={block.id} onClick={() => {
                      turnBlocksInto(editor, block);
                      setPanel("main");
                    }}>
                      <AppIcon icon={block.icon} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{t(block.labelKey)}</span>
                      {isCurrent && <HugeiconsIcon icon={CheckIcon} className="size-3.5 shrink-0" />}
                    </ToolbarRow>
                  ))
                : (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground">{t("colorText")}</div>
                    {colorRows("text")}
                    <Separator />
                    <div className="px-2 py-1 text-xs text-muted-foreground">{t("colorBackground")}</div>
                    {colorRows("background")}
                  </>
                )}
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
