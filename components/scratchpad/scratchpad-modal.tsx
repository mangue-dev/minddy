"use client";

import { useMobileLayout } from "@/lib/use-mobile-layout";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Copy01Icon, Delete02Icon, MoreHorizontalIcon, CheckIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { resolvePromptCopyAutoStart } from "@/lib/prompt-copy-auto-start";
import { useAuth } from "@/lib/auth-context";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadDoc } from "@/lib/use-scratchpad-query";
import { useRichDocument } from "@/lib/use-rich-document";
import { ScratchpadEditor } from "@/components/scratchpad/scratchpad-editor";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { useNumoMentionables } from "@/lib/use-numo-mentionables";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Notes — the personal scratchpad, a minimal modal at the create-project
 * dialog's size (actions top-right, content in the centered column). One
 * always-editable WYSIWYG surface (edit == preview): '##' section titles +
 * checkbox tasks, autosaved. Copy the whole note, or any single section, as a
 * ready-to-paste agent prompt.
 */
export function ScratchpadModal() {
  const mobile = useMobileLayout() === true;
  const { isOpen, setOpen } = useScratchpad();
  const t = useTranslations("Scratchpad");

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={mobile}
        // The “/” and “@” menus are portaled to <body> so the window, not the note's
        // scroll box, bounds it — which makes Radix read a click in it as a
        // click outside the dialog. Keep the notebook open for those.
        onInteractOutside={keepOverlayOpenForPopper}
        className="scratchpad-shell-dialog flex -translate-x-0 -translate-y-0 h-[var(--spacing-dialog-h)] max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 rounded-(--app-pane-radius) sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]"
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
  const { isOpen, setOpen, focusTaskIndex, clearFocusTask } = useScratchpad();
  const { user } = useAuth();
  // The notebook spans projects, so its mention picker uses the same global
  // source as Numo's global composer and only loads when "@" is typed.
  const { mentionables, links, scan, onMentionQuery } = useNumoMentionables(null);

  const markdownRef = useRef<(() => string) | null>(null);
  const applyRef = useRef<
    ((content: string, opts?: { emitUpdate?: boolean }) => void) | null
  >(null);
  const removeSettledRef = useRef<(() => number) | null>(null);
  const startAllRef = useRef<(() => number) | null>(null);

  const { content, updatedAt, isLoading, isSaving, save } = useScratchpadDoc({
    open: isOpen,
    liveRef: markdownRef,
    applyRef,
  });
  // The note's editor document (MIN-728); `undefined` while it loads.
  const { document: noteDocument, remember: rememberNoteDocument } =
    useRichDocument("notebook", "me", { enabled: isOpen });
  // The document being saved is the next opening's: no read needed then.
  const saveNote = useCallback(
    (content: string, document: JSONContent | null) => {
      save(content, document);
      rememberNoteDocument(document);
    },
    [save, rememberNoteDocument]
  );

  // Soft fade at the scroll edges (same pattern as the Kanban columns and the
  // agent feed) so it's clear the notes continue past the top/bottom.
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>();

  const removeSettled = () => {
    const removed = removeSettledRef.current?.() ?? 0;
    if (removed > 0) toast.success(t("removedSettled"));
    else toast(t("noSettled"));
  };

  // Copying work for an agent starts it when the account option is on (MIN-20)
  // — on the line (cf. task-item-view.tsx), the section, and here the entire
  // notebook: everything that remained to be done moves to "in progress".
  const startOnCopy = resolvePromptCopyAutoStart(user?.user_metadata);
  const liveMarkdown = () => (markdownRef.current?.() ?? content).trim();

  const copyAll = async () => {
    if (!liveMarkdown()) {
      toast(t("emptyCopyToast"));
      return;
    }
    const moved = startOnCopy ? (startAllRef.current?.() ?? 0) : 0;
    // Reread AFTER the move: the note comes out with its post-gesture markers.
    await navigator.clipboard.writeText(buildScratchpadPrompt(liveMarkdown()));
    toast.success(
      moved > 0 ? t("copiedMovedToast", { count: moved }) : t("copiedToast")
    );
  };
  const copySection = async (markdown: string, moved: number) => {
    await navigator.clipboard.writeText(
      buildScratchpadPrompt(markdown, { section: true })
    );
    toast.success(
      moved > 0
        ? t("copiedSectionMovedToast", { count: moved })
        : t("copiedSectionToast")
    );
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
                  <HugeiconsIcon icon={CheckIcon} className="size-3.5" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isSaving ? t("saving") : <SavedAgo updatedAt={updatedAt} />}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      <div data-mobile-sheet-toolbar className="absolute top-3.5 right-3.5 z-30 flex items-center gap-1">
        {!isLoading && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("actions")}
                    className="rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("actions")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void copyAll()}>
                <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                {t("copyAll")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={removeSettled}>
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                {t("removeSettled")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              data-mobile-sheet-close-legacy
              aria-label={t("close")}
              onClick={() => setOpen(false)}
              className="rounded-full text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
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
          {isLoading || noteDocument === undefined ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Spinner />
            </div>
          ) : (
            <ScratchpadEditor
              initialValue={content}
              initialDocument={noteDocument}
              uploadScope={user ? `chat/${user.id}` : null}
              onChange={saveNote}
              onCopySection={copySection}
              startOnCopy={startOnCopy}
              placeholder={t("placeholder")}
              copySectionLabel={t("copySection")}
              markdownRef={markdownRef}
              applyExternalRef={applyRef}
              removeSettledRef={removeSettledRef}
              startAllRef={startAllRef}
              focusTaskIndex={focusTaskIndex}
              onFocusTask={clearFocusTask}
              mentions={{
                options: mentionables,
                links,
                scan,
                onQuery: () => onMentionQuery(true),
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
