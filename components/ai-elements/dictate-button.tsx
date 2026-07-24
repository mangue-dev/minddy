"use client";

import { Mic, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";

import { DictateWaveform } from "./dictate-waveform";
import { eventKey } from "@/lib/keyboard/event-key";

const MAX_DURATION_MS = 90_000;
const NEAR_LIMIT_MS = 10_000;
// Peak deviation from the analyser's 128 midline that counts as speech —
// ambient room noise stays well under this, actual speech peaks far above.
const SPEECH_PEAK_THRESHOLD = 20;

type DictateStatus = "idle" | "starting" | "recording" | "processing";

export interface DictateButtonProps {
  /** Called with the transcribed text when recording completes. */
  onTranscription: (text: string) => void;
  /** Position the button absolutely (top-right). Defaults to inline-flex. */
  floating?: boolean;
  /** Disable the button (e.g. when streaming or submitting). */
  disabled?: boolean;
  /** Optional tooltip override. Defaults to the localized "Voice dictation" label. */
  tooltipLabel?: string;
  /**
   * When set, pressing this key toggles recording — same as clicking. Accepts a
   * bare key ("v") or a Shift combo ("shift+v"), case-insensitive. A bare key
   * only fires while focus isn't in a text field (it would type otherwise); a
   * Shift combo fires everywhere, inputs included. The listener lives for as
   * long as the button is mounted, so scope it by only rendering the button in
   * the context where the shortcut should apply.
   */
  shortcutKey?: string;
  className?: string;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** Parse a shortcut spec ("v" or "shift+v") into its parts, or null if unset. */
function parseShortcut(
  spec?: string,
): { requireShift: boolean; key: string } | null {
  if (!spec) return null;
  const lower = spec.toLowerCase();
  const requireShift = lower.startsWith("shift+");
  return { requireShift, key: requireShift ? lower.slice("shift+".length) : lower };
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
  onTranscription,
  floating = false,
  disabled = false,
  tooltipLabel,
  shortcutKey,
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

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
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
      recorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream);
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
    }, MAX_DURATION_MS);
  }, [cleanupStream, sendForTranscription, status, stopRecording, t]);

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (status === "recording") {
      stopRecording();
    } else if (status === "idle") {
      void startRecording();
    }
  }, [disabled, startRecording, status, stopRecording]);

  // Keyboard shortcut: toggle recording on `shortcutKey`. No Cmd/Ctrl/Alt, no
  // key-repeat. A bare key stands down while the user is typing (so it still
  // types normally in the title/description); a Shift combo carries its own
  // modifier, so it fires everywhere — inputs included.
  const shortcut = parseShortcut(shortcutKey);
  const shortcutChar = shortcut?.key ?? null;
  const shortcutRequireShift = shortcut?.requireShift ?? false;
  useEffect(() => {
    if (!shortcutChar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (shortcutRequireShift ? !e.shiftKey : e.shiftKey) return;
      if (eventKey(e) !== shortcutChar) return;
      if (!shortcutRequireShift) {
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
  }, [shortcutChar, shortcutRequireShift, handleClick]);

  const isBusy = status !== "idle";
  const isRecording = status === "recording";
  const isStarting = status === "starting";
  const isPopoverOpen = isRecording || isStarting;
  const remainingMs = Math.max(0, MAX_DURATION_MS - elapsedMs);
  const isNearLimit = isRecording && remainingMs <= NEAR_LIMIT_MS;

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
                aria-label={
                  tooltipLabel ?? (isRecording ? t("stop") : t("start"))
                }
                aria-pressed={isRecording}
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
                  isRecording && "text-brand",
                  floating && "absolute bottom-2 right-2 z-10",
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
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {shortcut.requireShift ? "⇧" : ""}
                  {shortcut.key.toUpperCase()}
                </kbd>
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
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    isNearLimit
                      ? "text-destructive animate-pulse"
                      : "text-foreground",
                  )}
                >
                  {formatTime(elapsedMs)}
                </span>
                <span>{t("maxDuration")}</span>
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
