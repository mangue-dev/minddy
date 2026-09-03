"use client";

import { useEffect, useId, useState } from "react";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { ExternalLink, Pencil } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "mangue-ui";
import { useTranslations } from "next-intl";

function shouldShowLinkMenu({ editor }: { editor: Editor }): boolean {
  return (
    editor.isEditable &&
    editor.view.hasFocus() &&
    editor.state.selection.empty &&
    editor.isActive("link")
  );
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-control focus-visible:bg-control"
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
            autoFocus
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
          <DialogFooter className="sm:justify-between">
            {hasLink ? (
              <Button type="button" variant="destructive" onClick={removeLink}>
                {t("selectionRemoveLink")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit">{tCommon("save")}</Button>
            </div>
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
  if (!editor) return null;

  const currentHref = () => {
    const href = editor.getAttributes("link").href;
    return typeof href === "string" ? href : "";
  };

  const openLink = () => {
    const href = currentHref();
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {!editOpen ? (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          shouldShow={shouldShowLinkMenu}
          options={{ placement: "bottom-start", offset: 6 }}
          role="menu"
          aria-label={t("selectionLinkActions")}
          className="min-w-40 rounded-lg border border-border bg-popover p-1 shadow-md"
        >
          <MenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-4 text-muted-foreground" aria-hidden />
            {t("selectionEditLink")}
          </MenuItem>
          <MenuItem onClick={openLink}>
            <ExternalLink className="size-4 text-muted-foreground" aria-hidden />
            {tResources("openLink")}
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
