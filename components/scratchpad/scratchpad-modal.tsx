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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "mangue-ui";
import { Check, Copy, ListX, X } from "lucide-react";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadDoc } from "@/lib/use-scratchpad-query";
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

  const markdownRef = useRef<(() => string) | null>(null);
  const applyRef = useRef<
    ((content: string, opts?: { emitUpdate?: boolean }) => void) | null
  >(null);
  const removeCompletedRef = useRef<(() => number) | null>(null);

  const { content, isLoading, isSaving, save } = useScratchpadDoc({
    open: isOpen,
    liveRef: markdownRef,
    applyRef,
  });

  // Soft fade at the scroll edges (same pattern as the Kanban columns and the
  // agent feed) so it's clear the notes continue past the top/bottom.
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>();

  const removeCompleted = () => {
    const removed = removeCompletedRef.current?.() ?? 0;
    if (removed > 0) toast.success(t("removedCompleted"));
    else toast(t("noCompleted"));
  };

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

  const showSaveState = !isLoading && (isSaving || content.trim() !== "");

  return (
    <>
      {showSaveState && (
        <div className="absolute top-4 left-5 z-30 flex items-center gap-1.5 text-xs text-muted-foreground">
          {isSaving ? (
            <>
              <Spinner className="size-3" />
              {t("saving")}
            </>
          ) : (
            <>
              <Check className="size-3.5" />
              {t("saved")}
            </>
          )}
        </div>
      )}

      <div className="absolute top-3.5 right-3.5 z-30 flex items-center gap-1">
        {!isLoading && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("removeCompleted")}
                  onClick={removeCompleted}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <ListX className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("removeCompleted")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("copyAllAria")}
                  onClick={copyAll}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Copy className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("copyAll")}</TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("close")}</TooltipContent>
        </Tooltip>
      </div>

      <div
        ref={fadeRef}
        {...scrollProps}
        className="flex flex-1 flex-col overflow-y-auto px-6 pt-48 pb-12"
      >
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
          {isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Spinner />
            </div>
          ) : (
            <ScratchpadEditor
              initialValue={content}
              onChange={save}
              onCopySection={copySection}
              placeholder={t("placeholder")}
              copySectionLabel={t("copySection")}
              markdownRef={markdownRef}
              applyExternalRef={applyRef}
              removeCompletedRef={removeCompletedRef}
            />
          )}
        </div>
      </div>
    </>
  );
}
