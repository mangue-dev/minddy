"use client";

import { Mic, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { KbdSequence } from "@/components/ui/kbd";

import { DictateWaveform } from "./dictate-waveform";
import { eventKey } from "@/lib/keyboard/event-key";
import { resolveKeyToken } from "@/lib/keyboard/shortcuts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

// Dictation isn't time-boxed: talk for as long as you need. The only ceiling
// left is the payload one — /api/transcribe rejects over 10 MB — so the
// recorder is pinned to a speech bitrate (see AUDIO_BITS_PER_SECOND) and a
// safety stop fires well inside that budget. A user never meets either: they
// exist so a tab left recording by accident still transcribes what it caught
// instead of dying on a 413 and losing the whole take.
const AUDIO_BITS_PER_SECOND = 48_000; // ~6 KB/s → 10 MB ≈ 28 min
const SAFETY_STOP_MS = 20 * 60_000;
// Peak deviation from the analyser's 128 midline that counts as speech —
// ambient room noise stays well under this, actual speech peaks far above.
const SPEECH_PEAK_THRESHOLD = 20;

type DictateStatus = "idle" | "starting" | "recording" | "processing";

/** The button command, for those who have stored it elsewhere (see `hideWhenIdle`). */
export interface DictateButtonHandle {
  /** Starts the shot, or stops it if it's spinning — exactly the click. */
  toggle: () => void;
}

export interface DictateButtonProps {
  ref?: Ref<DictateButtonHandle>;
  /** Called with the transcribed text when recording completes. */
  onTranscription: (text: string) => void;
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
  uploadAudio?: (blob: Blob, locale: string) => Promise<string | null>;
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
 * listener lives for as long as the button is mounted, so scope it by only
 * rendering the button in the context where the shortcut should apply.
 */
  shortcutKey?: string;
  /**
   * Notified while a finished take is being transcribed (mic released, audio in
   * flight). Hosts that can be dismissed use it to refuse the dismissal: unlike
   * recording — which puts an open popover in front of everything, swallowing
   * Escape and outside clicks — this window leaves every close path open, and
   * closing here throws the take away.
   */
  onProcessingChange?: (processing: boolean) => void;
  /**
   * The button is no longer the gateway to the gesture — a menu entry is
   * (Objectives page, MIN-226). It remains MOUNTED at rest, simply invisible:
   * the tape recorder, the chrono, the silence guard and the popover anchor
   * live here, and taking it apart would lose the current socket. It reappears
   * itself as soon as it records — then it's the stop button.
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
  className?: string;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
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

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function DictateButton({
  ref,
  onTranscription,
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
}: DictateButtonProps) {
  const t = useTranslations("Dictate");
  const locale = useLocale();

  const [status, setStatus] = useState<DictateStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recorderMimeRef = useRef<string>("audio/webm");
  const isMountedRef = useRef(true);
  // Speech gate: flips to true the first time a recording frame crosses
  // SPEECH_PEAK_THRESHOLD. Stopping while still false means a silent take.
  const speechDetectedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const cleanupStream = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupStream();
    };
  }, [cleanupStream]);

  // The send hook, read by a ref: the caller closes it on its own
  // status (the current draft, a run to resume) without having to memorize it.
  const uploadAudioRef = useRef(uploadAudio);
  useEffect(() => {
    uploadAudioRef.current = uploadAudio;
  });

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
      const upload = uploadAudioRef.current;
      if (upload) {
        try {
          const text = (await upload(blob, locale))?.trim() ?? "";
          if (!isMountedRef.current) return;
          // Same guard as below: without letters or numbers, Whisper has furnished
          // silence. The caller has already spoken about his own failures.
          if (/[\p{L}\p{N}]/u.test(text)) onTranscription(text);
          else if (text) toast.error(t("emptyResult"));
        } catch (err) {
          if (!isMountedRef.current) return;
          console.error("[DictateButton] upload failed", err);
          toast.error(t("error"));
        } finally {
          if (isMountedRef.current) setStatus("idle");
        }
        return;
      }

      const formData = new FormData();
      formData.append("audio", blob, `dictate.${blob.type.includes("ogg") ? "ogg" : "webm"}`);
      // Language hint = the UI locale. Whisper's auto-detect is unreliable on
      // short clips (a lone "bonjour" comes back as "hello") — pinning the
      // language keeps the transcription in the user's language, untranslated.
      formData.append("lang", locale);

      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          if (res.status === 429) {
            const data = (await res.json().catch(() => ({}))) as {
              retry_after?: number;
            };
            const minutes = Math.max(1, Math.ceil((data.retry_after ?? 60) / 60));
            toast.error(t("rateLimitReached", { minutes }));
          } else if (res.status === 413) {
            toast.error(t("tooLarge"));
          } else {
            toast.error(t("error"));
          }
          return;
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (!isMountedRef.current) return;
        // A transcript with no letter or digit ("...", "♪") is Whisper's
        // silence filler — treat it as an empty transcription.
        if (/[\p{L}\p{N}]/u.test(text)) onTranscription(text);
        else toast.error(t("emptyResult"));
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error("[DictateButton] transcribe failed", err);
        toast.error(t("error"));
      } finally {
        if (isMountedRef.current) setStatus("idle");
      }
    },
    [onTranscription, t, locale],
  );

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (status !== "idle" || mediaRecorderRef.current) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error(t("notSupported"));
      return;
    }

    setStatus("starting");
    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name ?? "";
      console.warn("[DictateButton] getUserMedia failed", name, err);
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        toast.error(t("noDevice"));
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        toast.error(t("deviceBusy"));
      } else {
        toast.error(t("permissionDenied"));
      }
      setStatus("idle");
      return;
    }

    const mimeType = pickRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(mediaStream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
    } catch (err) {
      console.error("[DictateButton] MediaRecorder init failed", err);
      mediaStream.getTracks().forEach((track) => track.stop());
      toast.error(t("notSupported"));
      setStatus("idle");
      return;
    }

    recorderMimeRef.current = recorder.mimeType || mimeType || "audio/webm";
    chunksRef.current = [];

    // Speech gate — watch the mic's time-domain peaks while recording so a
    // silent take is dropped without an API round-trip (on silence, Whisper
    // hallucinates filler text instead of returning an empty transcript).
    speechDetectedRef.current = false;
    let detectSpeech: (() => void) | null = null;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        const audioContext = new AudioCtx();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        audioContext.createMediaStreamSource(mediaStream).connect(analyser);
        audioContextRef.current = audioContext;
        void audioContext.resume().catch(() => {});
        const samples = new Uint8Array(analyser.fftSize);
        detectSpeech = () => {
          if (speechDetectedRef.current) return;
          analyser.getByteTimeDomainData(samples);
          for (const value of samples) {
            if (Math.abs(value - 128) >= SPEECH_PEAK_THRESHOLD) {
              speechDetectedRef.current = true;
              return;
            }
          }
        };
      }
    } catch {
      // No analyser — the gate stays open (see the onstop check).
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const blob = new Blob(chunks, { type: recorderMimeRef.current });
      // Trust the "no speech" verdict only if the analyser actually ran — no
      // AudioContext or a suspended one reads as flat silence regardless of
      // what the mic picked up.
      const silent =
        !speechDetectedRef.current &&
        audioContextRef.current?.state === "running";
      cleanupStream();
      if (blob.size === 0) {
        setStatus("idle");
        return;
      }
      if (silent) {
        toast.error(t("emptyResult"));
        setStatus("idle");
        return;
      }
      setStatus("processing");
      void sendForTranscription(blob);
    };

    mediaRecorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setStream(mediaStream);
    setElapsedMs(0);
    setStatus("recording");
    recorder.start();

    tickIntervalRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
      detectSpeech?.();
    }, 200);

    autoStopRef.current = setTimeout(() => {
      toast.info(t("maxReached"));
      stopRecording();
    }, SAFETY_STOP_MS);
  }, [cleanupStream, sendForTranscription, status, stopRecording, t]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (status === "recording") {
      stopRecording();
    } else if (status === "idle") {
      void startRecording();
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
    void startRecording();
  }, [autoStart, disabled, startRecording]);

  // Keyboard shortcut: toggle recording on `shortcutKey`. Modifiers must match
  // EXACTLY (so ⌘⇧D never fires on ⌘D), and no key-repeat. A bare key stands
  // down while the user is typing — it would type instead; a combo carries its
  // own modifiers, so it fires everywhere, inputs included. `preventDefault`
  // also swallows the browser's own binding for the combo (⌘⇧D = "bookmark all
  // tabs" in Chrome) while minddy has focus.
  const shortcut = useMemo(() => parseShortcut(shortcutKey), [shortcutKey]);
  useEffect(() => {
    if (!shortcut) return;
    const { mod, shift, alt, key } = shortcut;
    const isCombo = mod || shift || alt;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey ? !mod : mod) return;
      if (e.shiftKey !== shift || e.altKey !== alt) return;
      if (eventKey(e) !== key) return;
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
  const isStarting = status === "starting";
  const isPopoverOpen = isRecording || isStarting;

  return (
    <TooltipProvider>
      <Popover open={isPopoverOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={handleClick}
                disabled={disabled || status === "starting" || status === "processing"}
                // When recording, the STOP button: that's what you need
                // announce, whatever the label at rest. A tooltip
                // which promises a result (“we complete the return”) would describe
                // sinon un bouton qui fait l'inverse.
                aria-label={
                  isRecording ? t("stop") : (tooltipLabel ?? t("start"))
                }
                aria-pressed={isRecording}
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
                  isRecording && "text-brand",
                  floating && "absolute bottom-2 right-2 z-10",
                  // `display:none` and not a disassembly: the element remains the anchor
                  // of the popover, and it becomes visible again in the same rendering as
                  // the one who opens it (the status has already left “idle”).
                  hideWhenIdle && !isBusy && "hidden",
                  className,
                )}
              >
                {status === "processing" ? (
                  <Spinner className="h-4 w-4" />
                ) : isRecording ? (
                  <Square className="h-4 w-4 fill-current" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            </PopoverTrigger>
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
        <PopoverContent
          side="top"
          align="end"
          sideOffset={8}
          className="w-56 gap-2 p-3"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {isStarting ? (
            <div className="flex h-[88px] flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Spinner className="h-4 w-4" />
              <span>{t("starting")}</span>
            </div>
          ) : (
            <>
              {/* The chrono alone, centered: no more countdowns to display
 since dictation is no longer limited in duration. */}
              <div className="flex items-center justify-center text-xs">
                <span className="font-medium tabular-nums text-foreground">
                  {formatTime(elapsedMs)}
                </span>
              </div>
              <DictateWaveform stream={stream} />
              <p className="text-center text-xs text-muted-foreground">
                {t("hint")}
              </p>
            </>
          )}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
