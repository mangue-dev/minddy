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
  toast,
} from "mangue-ui";
import { Bot, Check, Copy, ListX, X } from "lucide-react";
import { buildScratchpadPrompt } from "@/lib/scratchpad-prompt";
import { resolvePromptCopyAutoStart } from "@/lib/prompt-copy-auto-start";
import { useAuth } from "@/lib/auth-context";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useScratchpadDoc } from "@/lib/use-scratchpad-query";
import { ScratchpadEditor } from "@/components/scratchpad/scratchpad-editor";
import { SLASH_MENU_ATTR } from "@/components/scratchpad/slash-command";
import { useLaunchAgentNote } from "@/components/scratchpad/use-launch-agent-note";
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
  const { user } = useAuth();

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

  // Soft fade at the scroll edges (same pattern as the Kanban columns and the
  // agent feed) so it's clear the notes continue past the top/bottom.
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>();

  const removeSettled = () => {
    const removed = removeSettledRef.current?.() ?? 0;
    if (removed > 0) toast.success(t("removedSettled"));
    else toast(t("noSettled"));
  };

  // Entrusting work to an agent means starting it — on the line (MIN-20/46,
  // cf. scratchpad-task.tsx), to the section, and here to the entire notebook: both
  // header buttons skip "in progress" everything that remained to be done. Copy
  // follows the account option, launching an agent always starts.
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

  // “Launch an agent” (MIN-84): the note is packaged in the SAME prompt as
  // copy it (the hook takes care of it, cf. use-launch-agent-note.ts) to the
  // compose from the Agents page, which makes you choose project / model / branch before
  // l'envoi.
  const launchNote = useLaunchAgentNote();
  // A SECTION is named as such in the prompt (“the following section of
  // my working notes”), exactly like its copy just above.
  const launchSection = (markdown: string) => launchNote(markdown, { section: true });
  const launchAll = () => {
    if (!liveMarkdown()) {
      toast(t("emptyCopyToast"));
      return;
    }
    // BEFORE `launchNote`: he closes the notebook, and it is this disassembly that flushes
    // autosave (scratchpad-editor.tsx) — started tasks leave with it.
    startAllRef.current?.();
    launchNote(liveMarkdown());
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
                  aria-label={t("removeSettled")}
                  onClick={removeSettled}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <ListX className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("removeSettled")}</TooltipContent>
            </Tooltip>
            {/* Run + copy side by side, in this order: parity with the
 section buttons (robot to the left of the copy). */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("launchAgentAllAria")}
                  onClick={launchAll}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <Bot className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("launchAgentAll")}</TooltipContent>
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
              onLaunchSection={launchSection}
              startOnCopy={startOnCopy}
              placeholder={t("placeholder")}
              copySectionLabel={t("copySection")}
              launchSectionLabel={t("launchAgentSection")}
              markdownRef={markdownRef}
              applyExternalRef={applyRef}
              removeSettledRef={removeSettledRef}
              startAllRef={startAllRef}
            />
          )}
        </div>
      </div>
    </>
  );
}
