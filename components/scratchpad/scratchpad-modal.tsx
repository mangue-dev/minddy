"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
import { SLASH_MENU_ATTR } from "@/components/scratchpad/slash-command";

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
        // The `/` menu is portaled to <body> so the window, not the note's
        // scroll box, bounds it — which makes Radix read a click in it as a
        // click outside the dialog. Keep the notebook open for those.
        onInteractOutside={(event) => {
          const target = event.target as Element | null;
          if (target?.closest?.(`[${SLASH_MENU_ATTR}]`)) event.preventDefault();
        }}
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

/**
 * "Saved 5 minutes ago" — the tooltip behind the save tick. Once opened, Radix
 * keeps the tooltip content mounted, so reading the clock at mount would freeze
 * the label at "just now" for as long as the notebook stays open; a slow tick
 * keeps it honest between hovers.
 */
function SavedAgo({ updatedAt }: { updatedAt: string | null }) {
  const t = useTranslations("Scratchpad");
  const format = useFormatter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const at = updatedAt ? new Date(updatedAt).getTime() : NaN;
  // Under a minute the relative formatter counts seconds out loud ("saved 4
  // seconds ago"), which is noisier than the text we just removed.
  if (!Number.isFinite(at) || now - at < 60_000) return <>{t("savedJustNow")}</>;
  return <>{t("savedAgo", { time: format.relativeTime(at, now) })}</>;
}

function ScratchpadBody() {
  const t = useTranslations("Scratchpad");
  const { isOpen, setOpen } = useScratchpad();

  const markdownRef = useRef<(() => string) | null>(null);
  const applyRef = useRef<
    ((content: string, opts?: { emitUpdate?: boolean }) => void) | null
  >(null);
  const removeCompletedRef = useRef<(() => number) | null>(null);

  const { content, updatedAt, isLoading, isSaving, save } = useScratchpadDoc({
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
        <div className="absolute top-3.5 left-3.5 z-30 flex size-8 items-center justify-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="status"
                aria-label={isSaving ? t("saving") : t("saved")}
                className="flex text-muted-foreground/60 transition-colors hover:text-muted-foreground"
              >
                {isSaving ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <Check className="size-3.5" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isSaving ? t("saving") : <SavedAgo updatedAt={updatedAt} />}
            </TooltipContent>
          </Tooltip>
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
