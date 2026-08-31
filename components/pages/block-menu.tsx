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
// that of the product labels, and each pastille is painted with the tokens
// CSS that will paint the text. A tablet cannot lie about the result.
//
// Everything related to the document is in block-actions.ts: this component does not
// only calls, so that the behavior remains testable without an interface.

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import {
  CopyPlus,
  Link2,
  MessageSquarePlus,
  Palette,
  Repeat2,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  cn,
  toast,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import {
  PAGE_COLORS,
  PAGE_COLOR_ATTRIBUTE,
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
  deleteBlocks,
  duplicateBlocks,
  focusBlockRange,
  insertSubpageAfter,
  selectedBlockCount,
  selectedBlockId,
  selectedSubpageId,
  selectionIsMediaOnly,
  turnBlocksInto,
} from "@/components/pages/block-actions";
import type { PageCommentAnchor } from "@/components/pages/page-comment-bubble";

/** The patch of a color, painted with the token it places — the “A”
 for the text, the solid square for the background. */
function Swatch({
  kind,
  color,
}: {
  kind: PageColorKind;
  color: PageColor | null;
}) {
  const attribute = color ? { [PAGE_COLOR_ATTRIBUTE[kind]]: color } : {};
  return (
    <span
      {...attribute}
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded border border-border text-xs font-semibold",
        !color && "text-muted-foreground"
      )}
    >
      A
    </span>
  );
}

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
        <Swatch kind={kind} color={null} />
        <span className="truncate">{t("colorNone")}</span>
        {active === null && <span className="ml-auto text-xs">✓</span>}
      </DropdownMenuItem>
      {PAGE_COLORS.map((color) => (
        <DropdownMenuItem
          key={`${kind}:${color}`}
          onSelect={() => {
            setColor(color);
            onDone();
          }}
        >
          <Swatch kind={kind} color={color} />
          <span className="truncate">{colorName(color)}</span>
          {active === color && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      ))}
    </>
  );
}

export function BlockMenu({
  editor,
  open,
  onOpenChange,
  onComment,
  children,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComment?: (anchor: PageCommentAnchor) => void;
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
  const count = useMemo(() => (open ? selectedBlockCount(editor) : 0), [open, editor]);

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
  const subpageId = useMemo(
    () => (open ? selectedSubpageId(editor) : null),
    [open, editor]
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
  const mediaOnly = useMemo(
    () => (open ? selectionIsMediaOnly(editor) : false),
    [open, editor]
  );
  const plain = !subpageId && !mediaOnly;

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
        align="start"
        side="bottom"
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
            <Repeat2 />
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
                  <Icon />
                  <span className="truncate">{t(block.labelKey)}</span>
                  {active && <span className="text-xs">✓</span>}
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
            <Palette />
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
              else duplicateBlocks(editor);
              close();
            }}
          >
            <CopyPlus />
            <span className="truncate">{t("duplicateBlock")}</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem
          onSelect={() => {
            void copyLink();
            close();
          }}
        >
          <Link2 />
          <span className="truncate">{t("copyBlockLink")}</span>
        </DropdownMenuItem>

        {onComment && count === 1 ? (
          <DropdownMenuItem
            onSelect={() => {
              const blockId = selectedBlockId(editor);
              if (blockId) onComment({ blockId, startNew: true });
              close();
            }}
          >
            <MessageSquarePlus />
            <span className="truncate">{t("commentSelection")}</span>
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

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
          <Trash2 />
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
