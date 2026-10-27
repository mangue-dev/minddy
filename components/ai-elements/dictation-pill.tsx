"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { cn } from "@/lib/utils";
import { DictationWave } from "./dictation-wave";
import type { DictationRecorder } from "./use-dictation-recorder";

/**
 * The dictation surface (MIN-773): one blocking pill, centred at the bottom of
 * the screen, for every dictation in the app — a bottom sheet in the mobile
 * layout, in the app's own theme. ✕ discards the take after a confirmation,
 * ✓ validates it (Enter or ⌘/Ctrl+Enter); between
 * them the voice-reactive wave and the timer, then a "Transcribing" state
 * while the take is turned into text (and cleaned up, unless the account
 * turned that off).
 *
 * It is a modal dialog on purpose: a take belongs to the field that opened it,
 * so nothing else can be clicked while it runs, and no dismissal path (Escape,
 * an outside click, a swipe) can silently throw it away — each one asks
 * through the same confirmation as ✕.
 *
 * A successful take closes with a short receipt: the pill collapses into a
 * circle around a checkmark, holds it long enough to be read, then leaves.
 */

/** How long the checkmark stays on screen once the circle has formed. */
export const DICTATION_DONE_HOLD_MS = 550;
/** Matches the pill's width transition below. */
const DICTATION_COLLAPSE_MS = 200;

export function formatDictationTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function DictationPill({ recorder }: { recorder: DictationRecorder }) {
  const t = useTranslations("Dictate");
  const mobile = useMobileLayout() === true;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const validateRef = useRef<HTMLButtonElement>(null);

  const { status, elapsedMs, stream, completedTakes } = recorder;
  // `done` draws the receipt and survives the exit animation; `holding` keeps
  // the dialog open while the receipt is on screen.
  const [done, setDone] = useState(false);
  const [holding, setHolding] = useState(false);
  const seenTakes = useRef(completedTakes);
  useEffect(() => {
    if (completedTakes === seenTakes.current) return;
    seenTakes.current = completedTakes;
    setDone(true);
    setHolding(true);
    const timer = window.setTimeout(
      () => setHolding(false),
      DICTATION_COLLAPSE_MS + DICTATION_DONE_HOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [completedTakes]);
  // A new take (the shortcut can start one at once) replaces the receipt.
  useEffect(() => {
    if (status === "starting") {
      setDone(false);
      setHolding(false);
    }
  }, [status]);
  const open = status !== "idle" || holding;
  const receipt = done && status === "idle";
  // Keeps the closed dialog mounted after a first take, so it can animate out.
  const [used, setUsed] = useState(open);
  if (open && !used) setUsed(true);
  const recording = status === "recording";
  const processing = status === "processing";
  // Before the microphone answers there is nothing to keep yet: ✕ stops at
  // once. Once words were caught, dropping them asks first.
  const canDiscard = status === "starting" || recording;
  // A take that ended (validated by the shortcut, say) closes its confirmation,
  // so the next take never opens with it.
  useEffect(() => {
    if (!recording) setConfirmOpen(false);
  }, [recording]);

  const requestDiscard = () => {
    if (status === "starting") recorder.cancel();
    else if (recording) setConfirmOpen(true);
  };
  const discard = () => {
    setConfirmOpen(false);
    recorder.cancel();
  };
  const validate = () => {
    if (recording) recorder.stop();
  };

  // ⌘/Ctrl+Enter validates, as it sends a composer; bare Enter too, except on
  // ✕, which keeps its own Enter (it opens the confirmation). Both work whatever
  // the send setting; the key caps on ✓ show the one the account chose.
  // Listened on the document: focus can sit outside the pill (back on a field
  // after the confirmation closed), and the key must not reach that field.
  const validateRefFn = useRef(validate);
  validateRefFn.current = validate;
  useEffect(() => {
    if (!recording || confirmOpen) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      const target = event.target instanceof Element ? event.target : null;
      if (!mod && target?.closest("[data-dictation-pill] button")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      validateRefFn.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [recording, confirmOpen]);

  const pill = (
    <div
      data-dictation-done={receipt ? "" : undefined}
      className={cn(
        // Concentric: the buttons fill the inner height (h-10 inside p-2.5), so
        // their round ends follow the pill's.
        "flex items-center gap-2 rounded-full bg-popover p-2.5 text-popover-foreground shadow-lg ring-1 ring-border",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        // The receipt: as wide as the pill is tall (h-10 + p-2.5), a circle.
        receipt
          ? "mx-auto w-15 justify-center overflow-hidden"
          : mobile ? "w-full" : "w-[min(28rem,calc(100vw-2rem))]",
      )}
    >
      {receipt ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-50 delay-100 duration-200 fill-mode-backwards">
          <HugeiconsIcon icon={Tick02Icon} className="size-5" strokeWidth={2.5} />
        </span>
      ) : (<>
      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        <PopoverAnchor asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={t("discard")}
            shortcut={["Esc"]}
            disabled={!canDiscard}
            onClick={requestDiscard}
            className="size-10"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </PopoverAnchor>
        <PopoverContent
          role="alertdialog"
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={10}
          className="w-72 gap-3 rounded-xl p-3"
        >
          <PopoverHeader>
            <PopoverTitle>{t("discardTitle")}</PopoverTitle>
            <PopoverDescription>{t("discardDescription")}</PopoverDescription>
          </PopoverHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
              {t("keepRecording")}
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={discard}>
              {t("discardConfirm")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <div className="flex h-10 min-w-0 flex-1 flex-col items-center justify-center">
        {status === "starting" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            <span>{t("starting")}</span>
          </div>
        ) : (
          <>
            <DictationWave stream={recording ? stream : null} busy={processing} className="h-[30px]" />
            <span
              className="text-2xs leading-none font-medium tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {processing ? t("transcribing") : formatDictationTime(elapsedMs)}
            </span>
          </>
        )}
      </div>

      <SendShortcutTooltip label={t("validate")}>
        <Button
          ref={validateRef}
          type="button"
          size="icon-lg"
          aria-label={t("validate")}
          tooltip={false}
          aria-disabled={!recording}
          onClick={validate}
          className={cn("size-10", !recording && "opacity-60 hover:bg-primary")}
        >
          {processing ? <Spinner className="size-4" /> : <HugeiconsIcon icon={Tick02Icon} className="size-4" />}
        </Button>
      </SendShortcutTooltip>
      </>)}
    </div>
  );

  // Mounted only once a take has begun: every mic button in the app carries a
  // pill, and one never used should cost nothing.
  if (!used) return null;

  return (
    <Dialog
      open={open}
      // Every dismissal (a swipe or the sheet's own close) goes through ✕.
      onOpenChange={(next) => {
        if (!next) requestDiscard();
      }}
    >
      <DialogContent
        data-dictation-pill=""
        aria-describedby={undefined}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          // ✓ takes focus, so Enter validates and Tab reaches ✕.
          event.preventDefault();
          validateRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          requestDiscard();
        }}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className={
          mobile
            ? "gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "top-auto bottom-[max(1.5rem,env(safe-area-inset-bottom))] w-auto max-w-none translate-y-0 gap-0 overflow-visible rounded-full bg-transparent p-0 ring-0 sm:max-w-none data-open:slide-in-from-bottom-4 data-closed:slide-out-to-bottom-4"
        }
      >
        <DialogTitle className={mobile ? "text-center" : "sr-only"}>{t("start")}</DialogTitle>
        {pill}
      </DialogContent>
    </Dialog>
  );
}
