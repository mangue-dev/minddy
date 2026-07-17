"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Spinner,
  toast,
} from "mangue-ui";
import { Copy, X } from "lucide-react";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { useScratchpad } from "@/lib/scratchpad-context";
import {
  useSaveScratchpad,
  useScratchpadQuery,
} from "@/lib/use-scratchpad-query";
import { ScratchpadEditor } from "@/components/scratchpad/scratchpad-editor";

/**
 * Notes — the personal scratchpad, a minimal modal at the create-project
 * dialog's size (actions top-right, content in the centered column). One
 * always-editable WYSIWYG surface (edit == preview): '##' section titles +
 * checkbox tasks, autosaved. Copy the whole note, or any single section, as a
 * ready-to-paste agent prompt.
 */
export function ScratchpadModal() {
  const { isOpen, setOpen } = useScratchpad();
  const t = useTranslations("Scratchpad");

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 !rounded-2xl sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]"
      >
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("srDescription")}
        </DialogDescription>
        <ScratchpadBody />
      </DialogContent>
    </Dialog>
  );
}

function ScratchpadBody() {
  const t = useTranslations("Scratchpad");
  const { isOpen, setOpen } = useScratchpad();
  const { content, isLoading } = useScratchpadQuery(isOpen);
  const save = useSaveScratchpad();

  const markdownRef = useRef<(() => string) | null>(null);

  const copyAll = async () => {
    const md = (markdownRef.current?.() ?? content).trim();
    if (!md) {
      toast(t("emptyCopyToast"));
      return;
    }
    await navigator.clipboard.writeText(buildScratchpadPrompt(md));
    toast.success(t("copiedToast"));
  };
  const copySection = async (markdown: string) => {
    await navigator.clipboard.writeText(
      buildScratchpadPrompt(markdown, { section: true })
    );
    toast.success(t("copiedSectionToast"));
  };

  return (
    <>
      <div className="absolute top-3.5 right-3.5 z-30 flex items-center gap-1">
        {!isLoading && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("copyAllAria")}
            title={t("copyAll")}
            onClick={copyAll}
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("close")}
          onClick={() => setOpen(false)}
          className="rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-6 pt-16 pb-12">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
          {isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Spinner />
            </div>
          ) : (
            <ScratchpadEditor
              initialValue={content}
              onChange={(md) => save.mutate(md)}
              onCopySection={copySection}
              placeholder={t("placeholder")}
              copySectionLabel={t("copySection")}
              markdownRef={markdownRef}
            />
          )}
        </div>
      </div>
    </>
  );
}
