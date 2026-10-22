"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon, SquareIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { KbdSequence } from "@/components/ui/kbd";

import { DictationPill } from "./dictation-pill";
import { useDictationRecorder } from "./use-dictation-recorder";
import { eventKey } from "@/lib/keyboard/event-key";
import { ownsDictationShortcut } from "@/lib/keyboard/dictation-shortcut";
import { resolveKeyToken } from "@/lib/keyboard/shortcuts";
import type { DictationContext } from "@/lib/dictation-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

/** The button command, for those who have stored it elsewhere (see `hideWhenIdle`). */
export interface DictateButtonHandle {
  /** Starts the shot, or stops it if it's spinning — exactly the click. */
  toggle: () => void;
}

export interface DictateButtonProps {
  ref?: Ref<DictateButtonHandle>;
  /** Called with the transcribed text when recording completes. */
  onTranscription: (text: string) => void;
  /** What the text will become after dictation, used by the cleanup pass. */
  context: DictationContext;
  /** Optional usage-ledger attribution for a specialized dictation surface. */
  feature?: "feedback_voice";
  /**
   * Overrides the default sending to `/api/transcribe`. Receives the plug and
   * local, makes the transcribed text — or `null` when the caller has already said
   * failure in its own way (the button then goes silent).
   *
   * The entry point for transcription is not the same everywhere: the board
   * public has its own (visitor session, expense charged to the owner), and a
   * Return dictation is entered into the ledger under its own feature. What remains
   * common — pick up the microphone, the wave, the chrono, the silence — remains
   * here, and that's why the hook is a prop and not a fork.
   */
  uploadAudio?: (
    blob: Blob,
    locale: string,
    context: DictationContext,
  ) => Promise<string | null>;
  /** Position the button absolutely (top-right). Defaults to inline-flex. */
  floating?: boolean;
  /** Disable the button (e.g. when streaming or submitting). */
  disabled?: boolean;
  /** Optional tooltip override. Defaults to the localized "Voice dictation" label. */
  tooltipLabel?: string;
  /**
 * When set, pressing this combo toggles recording — same as clicking. Accepts
 * a bare key ("v") or a combo of modifiers + key, case-insensitive, joined by
 * "+": "mod" (⌘ on macOS, Ctrl elsewhere), "shift", "alt". A bare key only
 * fires while focus isn't in a text field (it would type otherwise); a combo
 * carries its own modifiers, so it fires everywhere, inputs included — but it
 * must include a NON-typographic modifier ("mod" or "alt"): a lone Shift
 * combo is just how you type a capital letter, and would fire on it. The
 * listener lives for as long as the button is mounted. Only the foremost
 * visible dialog or panel handles it while an overlay is open.
 */
  shortcutKey?: string;
  /**
   * Notified while a finished take is being transcribed (mic released, audio in
   * flight). The dictation pill already blocks the interface during that window;
   * hosts that can also be closed programmatically use it to hold off.
   */
  onProcessingChange?: (processing: boolean) => void;
  /**
   * The button is no longer the gateway to the gesture — a menu entry is
   * (Objectives page, MIN-226). It stays MOUNTED, simply invisible: the
   * recorder, the shortcut and the dictation pill live here, and unmounting it
   * would lose the take in progress.
   */
  hideWhenIdle?: boolean;
  /**
   * Saves as soon as it appears, without clicks or shortcuts — the host opens
   * already listening (the “new ticket” dialog opened by ⌘⇧D).
   *
   * It's HERE that it's decided and not with the host, a question of timing: a
   * effect of the parent who would call `toggle()` by the ref would draw blank,
   * because the content of a Radix dialog only amounts to the SECOND rendering (its
   * `Presence` sends MOUNT from a layout effect) — the ref is still
   * zero when the parent's effect passes. Mounted here, the trigger follows the
   * assembly of the button, which is precisely the moment when everything is ready.
   *
   * Switching to `true` triggers ONE hold. It is up to the host to DISARM the
   * flag from {@link DictateButtonProps.onAutoStart}: the safeguard
   * internal is only good as long as the button remains mounted, and it is hosts
   * who dismantle it between two (the “new ticket” dialog replaces it with
   * the Numo icon while he resumes dictation). A flag that remained
   * lifted would turn the microphone back on when reassembled.
   */
  autoStart?: boolean;
  /** Recalled when {@link DictateButtonProps.autoStart} has just launched a
   * socket — the signal to disarm the flag on the host side. */
  onAutoStart?: () => void;
  /** Display the current action beside the microphone in prominent controls. */
  showLabel?: boolean;
  className?: string;
}

interface ParsedShortcut {
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod: boolean;
  shift: boolean;
  alt: boolean;
  /** The bare key, lowercase — compared against `eventKey(e)`. */
  key: string;
  /** Tokens for <KbdSequence>, in display order ("mod" resolved at render). */
  tokens: string[];
}

/** Parse a shortcut spec ("v", "mod+shift+d"), or null if unset/malformed. */
function parseShortcut(spec?: string): ParsedShortcut | null {
  if (!spec) return null;
  const parts = spec
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  const key = parts.pop();
  if (!key) return null;
  const mod = parts.includes("mod");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  return {
    mod,
    shift,
    alt,
    key,
    tokens: [
      ...(mod ? ["mod"] : []),
      ...(alt ? ["⌥"] : []),
      ...(shift ? ["⇧"] : []),
      key.toUpperCase(),
    ],
  };
}

export function DictateButton({
  ref,
  onTranscription,
  context,
  feature,
  uploadAudio,
  floating = false,
  disabled = false,
  tooltipLabel,
  shortcutKey,
  onProcessingChange,
  hideWhenIdle = false,
  autoStart = false,
  onAutoStart,
  className,
  showLabel = false,
}: DictateButtonProps) {
  const t = useTranslations("Dictate");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const recorder = useDictationRecorder({ context, feature, uploadAudio, onTranscription });
  const { status, start: startRecording, stop: stopRecording } = recorder;

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (status === "recording") {
      stopRecording();
    } else if (status === "idle") {
      startRecording();
    }
  }, [disabled, startRecording, status, stopRecording]);

  useImperativeHandle(ref, () => ({ toggle: handleClick }), [handleClick]);

  // Socket open automatically (see `autoStart`). The guardrail is a ref, not the
  // only list of dependencies: `startRecording` changes identity each time
  // change of status, and without it the END of a take — the return to
  // “idle” — would immediately restart another one. A host still busy
  // (`disabled`) makes you wait for the hold rather than losing it.
  const autoStartedRef = useRef(false);
  const onAutoStartRef = useRef(onAutoStart);
  useEffect(() => {
    onAutoStartRef.current = onAutoStart;
  });
  useEffect(() => {
    if (!autoStart) {
      autoStartedRef.current = false;
      return;
    }
    if (disabled || autoStartedRef.current) return;
    autoStartedRef.current = true;
    onAutoStartRef.current?.();
    startRecording();
  }, [autoStart, disabled, startRecording]);

  // Keyboard shortcut: toggle recording on `shortcutKey`. Modifiers must match
  // EXACTLY (so ⌘⇧D never fires on ⌘D), and no key-repeat. A bare key stands
  // down while the user is typing — it would type instead; a combo carries its
  // own modifiers, so it fires everywhere, inputs included. `preventDefault`
  // also swallows the browser's own binding for the combo (⌘⇧D = "bookmark all
  // tabs" in Chrome) while minddy has focus. While the pill is open the same
  // combo validates the take (the pill never claims the shortcut itself).
  const shortcut = useMemo(() => parseShortcut(shortcutKey), [shortcutKey]);
  useEffect(() => {
    if (!shortcut) return;
    const { mod, shift, alt, key } = shortcut;
    const isCombo = mod || shift || alt;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey ? !mod : mod) return;
      if (e.shiftKey !== shift || e.altKey !== alt) return;
      if (eventKey(e) !== key) return;
      if (!ownsDictationShortcut(buttonRef.current)) return;
      if (!isCombo) {
        const el = e.target as HTMLElement | null;
        if (
          el &&
          (el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.isContentEditable)
        )
          return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      handleClick();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [shortcut, handleClick]);

  // Report the transcribing window to the host. Routed through a ref so the
  // callback needn't be memoized, and always reported as over on unmount: the
  // transcript landing is exactly what makes some hosts swap this button out
  // (for Numo's icon), and a host still waiting on a component that no longer
  // exists would stay blocked forever.
  const onProcessingChangeRef = useRef(onProcessingChange);
  useEffect(() => {
    onProcessingChangeRef.current = onProcessingChange;
  });
  useEffect(() => {
    onProcessingChangeRef.current?.(status === "processing");
  }, [status]);
  useEffect(() => () => onProcessingChangeRef.current?.(false), []);

  const isBusy = status !== "idle";
  const isRecording = status === "recording";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            onClick={handleClick}
            disabled={disabled || status === "starting" || status === "processing"}
            // Announce the stop action while recording, independently of the idle label.
            aria-label={isRecording ? t("stop") : (tooltipLabel ?? t("start"))}
            aria-pressed={isRecording}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
              isBusy && "text-foreground",
              showLabel && "h-auto w-auto min-h-11 gap-2 px-3 py-2",
              floating && "absolute bottom-2 right-2 z-10",
              hideWhenIdle && "hidden",
              className,
            )}
          >
            {status === "processing" ? (
              <Spinner className="h-4 w-4" />
            ) : isRecording ? (
              <HugeiconsIcon icon={SquareIcon} className="h-4 w-4 fill-current" />
            ) : (
              <HugeiconsIcon icon={Mic01Icon} className="h-4 w-4" />
            )}
            {showLabel && <span className="min-w-0 text-left text-sm font-medium">
              {isRecording ? t("stop") : status === "starting" ? t("starting") : status === "processing" ? t("inFlight") : (tooltipLabel ?? t("start"))}
            </span>}
          </button>
        </TooltipTrigger>
        {!isBusy && (
          <TooltipContent side="top" className="flex items-center gap-1.5">
            {tooltipLabel ?? t("start")}
            {shortcut && (
              <KbdSequence
                keys={[shortcut.tokens.map(resolveKeyToken)]}
                size="sm"
              />
            )}
          </TooltipContent>
        )}
      </Tooltip>
      <DictationPill recorder={recorder} />
    </TooltipProvider>
  );
}
