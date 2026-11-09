"use client";

import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Edit04Icon, LinkSquare01Icon, Unlink04Icon } from "@hugeicons/core-free-icons";
import { useEffect, useId, useState } from "react";
import { getMarkRange, type Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MENU_ROW_CLASS, MENU_SURFACE_CLASS } from "@/components/ui/menu-surface";
import { pageLinkTarget } from "@/lib/page-link";
import { useOptionalPagePanelActions } from "@/lib/page-panel-context";

function shouldShowLinkMenu({ editor }: { editor: Editor }): boolean {
  // A delayed menu update can run while the view is not mounted (an editor
  // built during render, a hidden retained tab): reading it would throw.
  if (!editor.isInitialized || editor.isDestroyed) return false;
  return (
    editor.isEditable &&
    editor.view.hasFocus() &&
    editor.state.selection.empty &&
    editor.isActive("link")
  );
}

function MenuItem({
  onClick,
  destructive = false,
  children,
}: {
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      // A dropdown item's row and highlight (components/ui/menu-surface.ts).
      className={cn(
        MENU_ROW_CLASS,
        "cursor-default outline-none select-none",
        destructive
          ? "text-destructive hover:bg-destructive-highlight focus-visible:bg-destructive-highlight"
          : "text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** App-native dialog for changing or removing the selected TipTap link. */
export function MarkdownLinkEditDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const inputId = useId();
  const [href, setHref] = useState("");
  const [hasLink, setHasLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const current = editor.getAttributes("link").href;
    setHasLink(editor.isActive("link"));
    setHref(typeof current === "string" ? current : "");
    setError(null);
  }, [editor, open]);

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(hasLink ? "selectionEditLink" : "selectionAddLink")}
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextHref = href.trim();
            if (!nextHref) {
              setError(t("selectionLinkInvalid"));
              return;
            }
            const updated = editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: nextHref })
              .run();
            if (!updated) {
              setError(t("selectionLinkInvalid"));
              return;
            }
            onOpenChange(false);
          }}
        >
          <label htmlFor={inputId} className="text-sm font-medium">
            {t("selectionLinkPrompt")}
          </label>
          <Input
            id={inputId}
            autoFocus={allowInputAutoFocus()}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={href}
            onChange={(event) => {
              setHref(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {/* The buttons are the footer's own children: in the phone's bottom
              sheet they stack, full width, Save first; on a desktop removing
              the link sits apart on the left. */}
          <DialogFooter className="[.mobile-bottom-sheet_&]:!grid-cols-1">
            {hasLink ? (
              <Button type="button" variant="destructive" className="sm:mr-auto" onClick={removeLink}>
                {t("selectionRemoveLink")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" className="[.mobile-bottom-sheet_&]:order-first">{tCommon("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Actions shown after clicking a regular link inside an editable TipTap surface. */
export function MarkdownLinkMenu({ editor }: { editor: Editor | null }) {
  const t = useTranslations("Pages");
  const tResources = useTranslations("Resources");
  const [editOpen, setEditOpen] = useState(false);
  const pagePanel = useOptionalPagePanelActions();

  // A click on a link puts the caret at its END, where the menu then opens,
  // instead of wherever the pointer landed inside the word.
  useEffect(() => {
    if (!editor) return;
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!editor.isEditable || editor.isDestroyed || !editor.state.selection.empty) return;
      if (!(event.target instanceof Element) || !event.target.closest("a")) return;
      const { state } = editor;
      const range = getMarkRange(state.selection.$from, state.schema.marks.link);
      if (!range || state.selection.from === range.to) return;
      editor.commands.setTextSelection(range.to);
    };
    // The view exists once the editor is created; reading it earlier throws.
    let dom: HTMLElement | null = null;
    const attach = () => {
      if (dom || editor.isDestroyed) return;
      dom = editor.view.dom;
      dom.addEventListener("click", onClick);
    };
    if (editor.isInitialized) attach();
    else editor.on("create", attach);
    return () => {
      editor.off("create", attach);
      dom?.removeEventListener("click", onClick);
    };
  }, [editor]);

  if (!editor) return null;

  const currentHref = () => {
    const href = editor.getAttributes("link").href;
    return typeof href === "string" ? href : "";
  };

  const openLink = () => {
    const href = currentHref();
    if (!href) return;
    // A link to a page of the app is read in the page panel (MIN-777).
    const page = pagePanel ? pageLinkTarget(href, window.location.origin) : null;
    if (page && pagePanel) pagePanel.openPage(page.projectId, page.pageId);
    else window.open(href, "_blank", "noopener,noreferrer");
  };

  const copyLink = () => {
    const href = currentHref();
    if (!href) return;
    void navigator.clipboard.writeText(href).then(
      () => toast.success(t("selectionLinkCopied")),
      () => undefined,
    );
  };

  // Removing the mark is an editor edit that ⌘Z restores, so it needs no
  // confirmation (DESIGN.md, "Destructive actions ask first").
  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  };

  return (
    <>
      {!editOpen ? (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          shouldShow={shouldShowLinkMenu}
          options={{ placement: "bottom-start", offset: 6 }}
          // On the body, like the selection toolbar: inside the editor, an
          // ancestor (a dialog, a panel) cuts the backdrop the menu blurs.
          appendTo={() => document.body}
          role="menu"
          data-floating-surface
          aria-label={t("selectionLinkActions")}
          // The dropdown's surface (components/ui/menu-surface.ts): same
          // radius, padding and edge as every other menu of the app.
          className={cn("pointer-events-auto z-[70] min-w-40", MENU_SURFACE_CLASS)}
        >
          <MenuItem onClick={() => setEditOpen(true)}>
            <HugeiconsIcon icon={Edit04Icon} className="size-4 text-muted-foreground" aria-hidden />
            {t("selectionEditLink")}
          </MenuItem>
          <MenuItem onClick={openLink}>
            <HugeiconsIcon icon={LinkSquare01Icon} className="size-4 text-muted-foreground" aria-hidden />
            {tResources("openLink")}
          </MenuItem>
          <MenuItem onClick={copyLink}>
            <HugeiconsIcon icon={Copy01Icon} className="size-4 text-muted-foreground" aria-hidden />
            {t("selectionCopyLink")}
          </MenuItem>
          <div role="separator" className="-mx-2 my-1 h-px bg-menu-separator" />
          <MenuItem onClick={removeLink} destructive>
            <HugeiconsIcon icon={Unlink04Icon} className="size-4" aria-hidden />
            {t("selectionRemoveLink")}
          </MenuItem>
        </BubbleMenu>
      ) : null}
      <MarkdownLinkEditDialog
        editor={editor}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}
