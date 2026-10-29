"use client";

// The menu ⋯ of a page block.
//
// What to see when reading it: there is NO list of blocks here. THE
// submenu “transform to” is `turnIntoItems(editor)`, that is to say the
// register (MIN-267) filtered on what is convertible, in its order, with
// its active entry checked and its shortcut displayed. The day we add a
// array block, this file does not move — and the shortcut it displays is
// exactly the one that the keyboard triggers, since both read the same
// descriptor field.
//
// The same for the colors: the palette comes from blocks/color.ts, therefore from
// that of the product labels, and each color's NAME is painted with the CSS
// tokens that will paint the text (PageColorName): the entry cannot lie about
// the result.
//
// Everything related to the document is in block-actions.ts: this component does not
// only calls, so that the behavior remains testable without an interface.

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { CheckIcon, ColorPickerIcon, Copy01Icon, Delete02Icon, Link02Icon, MessageAdd01Icon, RepeatOne02Icon } from "@hugeicons/core-free-icons";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { NumoIcon } from "@/components/numo-icon";
import { useAskNumoAboutSelection } from "@/lib/use-ask-numo-about-selection";
import type { Editor } from "@tiptap/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Kbd } from "@/components/ui/kbd";
import {
  PAGE_COLORS,
  activeCalloutColor,
  activePageColor,
  setCalloutColor,
  setPageColor,
  turnIntoItems,
  type PageColor,
  type PageColorKind,
} from "@/components/pages/blocks";
import {
  blockRange,
  blockLink,
  copyBlocks,
  deleteBlocks,
  focusBlockRange,
  insertSubpageAfter,
  selectedBlockCount,
  selectedBlockId,
  selectedSubpageId,
  selectionIsMediaOnly,
  turnBlocksInto,
} from "@/components/pages/block-actions";
import { PageColorName, type PageCommentAnchor } from "@/components/pages/page-comment-bubble";

function ColorItems({
  editor,
  kind,
  onDone,
}: {
  editor: Editor;
  kind: PageColorKind;
  onDone: () => void;
}) {
  const t = useTranslations("Pages");
  const colorName = useTranslations("Categories.colors");
  const calloutColor =
    kind === "background" ? activeCalloutColor(editor) : undefined;
  const active =
    calloutColor === undefined ? activePageColor(editor, kind) : calloutColor;
  const setColor = (color: PageColor | null) =>
    calloutColor === undefined
      ? setPageColor(editor, kind, color)
      : setCalloutColor(editor, color);

  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          setColor(null);
          onDone();
        }}
      >
        <span className="min-w-0 flex-1"><PageColorName kind={kind} color={null} label={t("colorNone")} /></span>
        {active === null && <HugeiconsIcon icon={CheckIcon} className="ml-auto size-3" />}
      </DropdownMenuItem>
      {PAGE_COLORS.map((color) => (
        <DropdownMenuItem
          key={`${kind}:${color}`}
          onSelect={() => {
            setColor(color);
            onDone();
          }}
        >
          <span className="min-w-0 flex-1"><PageColorName kind={kind} color={color} label={colorName(color)} /></span>
          {active === color && <HugeiconsIcon icon={CheckIcon} className="ml-auto size-3" />}
        </DropdownMenuItem>
      ))}
    </>
  );
}

/**
 * What the menu read from the selection at its last opening, kept while it
 * closes. Recomputing on close made a reduced menu (an image, a subpage)
 * repopulate with its hidden entries during the exit animation.
 */
function useHeldWhileClosed<T>(open: boolean, value: T): T {
  const held = useRef(value);
  if (open) held.current = value;
  return held.current;
}

export function BlockMenu({
  editor,
  open,
  onOpenChange,
  onComment,
  blockLinks = true,
  children,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComment?: (anchor: PageCommentAnchor) => void;
  /** Offer “Copy link to block”: only where the document has an address. */
  blockLinks?: boolean;
  /** The trigger — the margin handle, or any button. */
  children: React.ReactNode;
}) {
  const t = useTranslations("Pages");
  const [pendingDelete, setPendingDelete] = useState<{
    range: { from: number; to: number };
    count: number;
  } | null>(null);

  // Recalculated at each OPENING: the selection has moved between two, and one
  // “transform to” which checks the block before is worse than no check.
  const items = useMemo(() => (open ? turnIntoItems(editor) : []), [open, editor]);
  const count = useHeldWhileClosed(
    open,
    useMemo(() => (open ? selectedBlockCount(editor) : 0), [open, editor])
  );

  /**
 * A single subpage block in selection: the menu changes VOCABULARY
 * (MIN-272).
 *
 * What we remove — “transform into” and the colors — is not a
 * comfort simplification: a link to a document does not convert en
 * quote, and its text is not text to paint, it is the title of a
 * other page, reread at each rendering. Both entries acted on a block
 * which has neither.
 *
 * And what remains speaks of the PAGE: duplicate the copy, it and its
 * subpages; delete puts it in the trash — hence the wording of the
 * sidebar, word for word, because it's the same gesture.
 */
  const subpageId = useHeldWhileClosed(
    open,
    useMemo(() => (open ? selectedSubpageId(editor) : null), [open, editor])
  );

  /**
 * An image or a file, alone in selection (MIN-282): the menu is reduced
 * for the same reason as on a subpage - what is removed has no meaning
 * on this block.
 *
 * “Transform into” and the colors, as for the subpage: a file does not
 * does not become a quote, and it has no text to paint. And DUPLICATE in
 * more, what the subpage keeps: duplicating a subpage really copies the
 * page, whereas duplicating an image does not copy any bytes — it sets a second reference to the same file, which reads as a copy without being one, and deleting one side does not release any the other.
 */
  const mediaOnly = useHeldWhileClosed(
    open,
    useMemo(() => (open ? selectionIsMediaOnly(editor) : false), [open, editor])
  );
  const plain = !subpageId && !mediaOnly;
  const canComment = Boolean(onComment) && count === 1;
  // The selected blocks' text, as the selection toolbar sends a passage;
  // absent where Numo is not.
  const askNumo = useAskNumoAboutSelection();
  const tBulk = useTranslations("BulkActions");
  const askAboutBlocks = () => {
    const range = blockRange(editor);
    const text = range ? editor.state.doc.textBetween(range.from, range.to, "\n", " ").trim() : "";
    if (askNumo && text) askNumo({ text });
    close();
  };
  // The separator divides the actions from Delete: with nothing above it (an
  // image or a file without a block link), it would underline nothing.
  const hasActionsAbove = plain || !mediaOnly || blockLinks || canComment;

  const duplicateSubpage = async (pageId: string) => {
    const duplicate = editor.storage.subpage?.duplicate;
    // The copy's place is retained NOW: copying is a round trip
    // to the server, and the selection may have moved when he returns control.
    const at = blockRange(editor)?.to;
    if (!duplicate || at === undefined) return;
    const copy = await duplicate(pageId);
    // The block is ONLY placed if the copy was successful: a block to a page which
    // does not exist would be rendered as an orphan, for an error already reported.
    if (copy && !editor.isDestroyed) insertSubpageAfter(editor, copy, at);
  };

  const close = () => onOpenChange(false);
  const closeAndFocus = () => {
    onOpenChange(false);
    focusBlockRange(editor, blockRange(editor));
  };

  // “Copy” only fills the clipboard; the document is unchanged until a
  // paste. A subpage keeps “Duplicate”, which copies the page itself: a
  // copied subpage block would paste a second link to the same page.
  const copySelection = async () => {
    try {
      if (await copyBlocks(editor)) toast.success(t("blockCopied"));
    } catch {
      toast.error(t("blockCopyFailed"));
    }
  };

  const copyLink = async () => {
    const id = selectedBlockId(editor);
    if (!id) return;
    await navigator.clipboard.writeText(blockLink(window.location.href, id));
    toast.success(t("blockLinkCopied"));
  };

  return (
    <>
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        // To the LEFT of the handle, in the margin, top-aligned with it: the
        // menu opens away from the text rather than over it. Radix flips it to
        // the right when the margin has no room for it.
        align="start"
        side="left"
        sideOffset={4}
        className="w-60"
        // Escape and click outside returns the cursor to the block: otherwise, the focus
        // stays on a trigger that disappears on hover, and hits
        // suivante se perd.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusBlockRange(editor, blockRange(editor));
        }}
      >
        {count > 1 && (
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("blocksSelected", { count })}
          </DropdownMenuLabel>
        )}

        {plain && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={RepeatOne02Icon} />
            <span className="truncate">{t("turnInto")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {items.map(({ block, active }) => {
              const Icon = block.icon;
              return (
                <DropdownMenuItem
                  key={block.id}
                  onSelect={() => {
                    turnBlocksInto(editor, block);
                    close();
                  }}
                >
                  <AppIcon icon={Icon} />
                  <span className="truncate">{t(block.labelKey)}</span>
                  {active && <HugeiconsIcon icon={CheckIcon} className="size-3" />}
                  {block.shortcut && (
                    <DropdownMenuShortcut>
                      <Kbd size="sm">{block.shortcut.display}</Kbd>
                    </DropdownMenuShortcut>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        )}

        {plain && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={ColorPickerIcon} />
            <span className="truncate">{t("color")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-52 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("colorText")}
            </DropdownMenuLabel>
            <ColorItems editor={editor} kind="text" onDone={close} />
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {activeCalloutColor(editor) === undefined
                ? t("colorBackground")
                : t("calloutColor")}
            </DropdownMenuLabel>
            <ColorItems editor={editor} kind="background" onDone={close} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        )}

        {plain && <DropdownMenuSeparator />}

        {!mediaOnly && (
          <DropdownMenuItem
            onSelect={() => {
              if (subpageId) void duplicateSubpage(subpageId);
              else void copySelection();
              close();
            }}
          >
            <HugeiconsIcon icon={Copy01Icon} />
            <span className="truncate">{t(subpageId ? "duplicateBlock" : "copyBlock")}</span>
          </DropdownMenuItem>
        )}

        {blockLinks && (
          <DropdownMenuItem
            onSelect={() => {
              void copyLink();
              close();
            }}
          >
            <HugeiconsIcon icon={Link02Icon} />
            <span className="truncate">{t("copyBlockLink")}</span>
          </DropdownMenuItem>
        )}

        {onComment && canComment ? (
          <DropdownMenuItem
            onSelect={() => {
              const blockId = selectedBlockId(editor);
              if (blockId) onComment({ blockId, startNew: true });
              close();
            }}
          >
            <HugeiconsIcon icon={MessageAdd01Icon} />
            <span className="truncate">{t("commentSelection")}</span>
          </DropdownMenuItem>
        ) : null}

        {askNumo && !mediaOnly ? (
          <DropdownMenuItem onSelect={askAboutBlocks}>
            <NumoIcon animated={false} className="size-4" />
            <span className="truncate">{tBulk("askNumo")}</span>
          </DropdownMenuItem>
        ) : null}

        {hasActionsAbove && <DropdownMenuSeparator />}

        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            if (subpageId) {
              deleteBlocks(editor);
              closeAndFocus();
              return;
            }
            const range = blockRange(editor);
            if (range) setPendingDelete({ range, count: Math.max(1, count) });
            close();
          }}
        >
          <HugeiconsIcon icon={Delete02Icon} />
          {/* On a subpage, the gesture does not delete a block: it places a
 PAGE in the trash, with its descendants. The wording is that of
 the sidebar, word for word — it's the same gesture, it should not
 have two names depending on where it is triggered from. */}
          <span className="truncate">
            {subpageId ? t("deletePage") : t("deleteBlock")}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <AlertDialog
      open={pendingDelete !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setPendingDelete(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("blockDeleteTitle", { count: pendingDelete?.count ?? 1 })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("blockDeleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("blockDeleteCancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              const range = pendingDelete?.range;
              if (range) editor.chain().focus().deleteRange(range).run();
              setPendingDelete(null);
              focusBlockRange(editor, range ?? null);
            }}
          >
            {t("blockDeleteConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
