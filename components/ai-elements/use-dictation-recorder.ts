"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuthOptional } from "@/lib/auth-context";
import { resolveDictationCleanup, type DictationContext } from "@/lib/dictation-context";
import { resolveDictationVocabulary } from "@/lib/dictation-vocabulary";

/**
 * The one recording pipeline behind every voice dictation (MIN-773): the
 * microphone mic buttons (`DictateButton`) and the notebook's `/` command both
 * drive it and both show it through `DictationPill`.
 *
 * getUserMedia → MediaRecorder → silence gate → POST /api/transcribe (or the
 * caller's own `uploadAudio`), which returns the recognized words already
 * cleaned up unless the account turned the cleanup off. `stop()` validates the
 * take; `cancel()` throws it away without sending anything.
 */

// Dictation isn't time-boxed: talk for as long as you need. The only ceiling
// left is the payload one — /api/transcribe rejects over 10 MB — so the
// recorder is pinned to a speech bitrate and a safety stop fires well inside
// that budget. A user never meets either: they exist so a tab left recording by
// accident still transcribes what it caught instead of dying on a 413.
const AUDIO_BITS_PER_SECOND = 48_000; // ~6 KB/s → 10 MB ≈ 28 min
const SAFETY_STOP_MS = 20 * 60_000;
// Peak deviation from the analyser's 128 midline that counts as speech —
// ambient room noise stays well under this, actual speech peaks far above.
const SPEECH_PEAK_THRESHOLD = 20;

export type DictationStatus = "idle" | "starting" | "recording" | "processing";

export interface DictationRecorder {
  status: DictationStatus;
  elapsedMs: number;
  /** The live microphone stream while recording, for the wave. */
  stream: MediaStream | null;
  start: () => void;
  /** Ends the take and transcribes it. */
  stop: () => void;
  /** Ends the take and drops it: nothing is sent. */
  cancel: () => void;
  /** Takes transcribed and handed over so far; it grows once per success. */
  completedTakes: number;
}

export interface DictationRecorderOptions {
  /** What the text will become, used by the server's cleanup pass. */
  context: DictationContext;
  /** Optional usage-ledger attribution for a specialized dictation surface. */
  feature?: "feedback_voice";
  /**
   * Replaces the POST to `/api/transcribe` (the public feedback board has its
   * own route). Resolves to the text, or `null` when the caller already
   * reported its own failure.
   */
  uploadAudio?: (
    blob: Blob,
    locale: string,
    context: DictationContext,
  ) => Promise<string | null>;
  /** Called with the transcribed text when a validated take succeeds. */
  onTranscription: (text: string) => void;
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

/** A transcript with no letter or digit ("...", "♪") is Whisper's silence filler. */
function hasSpeech(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function useDictationRecorder({
  context,
  feature,
  uploadAudio,
  onTranscription,
}: DictationRecorderOptions): DictationRecorder {
  const t = useTranslations("Dictate");
  const locale = useLocale();
  // The live preference: the server's session claims can lag behind a switch
  // the user just flipped (see /api/transcribe).
  const accountMeta = useAuthOptional()?.user?.user_metadata;
  const cleanupEnabled = resolveDictationCleanup(accountMeta);
  // Same for the vocabulary (MIN-773): a word just added counts at once.
  const vocabularyJson = JSON.stringify(resolveDictationVocabulary(accountMeta));

  const [status, setStatus] = useState<DictationStatus>("idle");
  const [completedTakes, setCompletedTakes] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeRef = useRef("audio/webm");
  const mountedRef = useRef(true);
  // Speech gate: flips to true the first time a recording frame crosses
  // SPEECH_PEAK_THRESHOLD. Stopping while still false means a silent take.
  const speechRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelledRef = useRef(false);

  // Read through refs: callers close these over their own state (the current
  // draft, the editor) without having to memoize them.
  const onTranscriptionRef = useRef(onTranscription);
  const uploadAudioRef = useRef(uploadAudio);
  useEffect(() => {
    onTranscriptionRef.current = onTranscription;
    uploadAudioRef.current = uploadAudio;
  });

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Unmounting mid-take drops it: the destination is gone. `mountedRef` is
      // what says so (every later step checks it), not `cancelledRef`: React's
      // dev double mount runs this cleanup right after an auto-started take
      // began, and a cancel flag would outlive the remount and drop it.
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      cleanup();
    };
  }, [cleanup]);

  const transcribe = useCallback(
    async (blob: Blob) => {
      const upload = uploadAudioRef.current;
      if (upload) {
        try {
          const text = (await upload(blob, locale, context))?.trim() ?? "";
          if (!mountedRef.current) return;
          // The caller has already reported its own failures (`null`).
          if (hasSpeech(text)) {
            onTranscriptionRef.current(text);
            setCompletedTakes((count) => count + 1);
          } else if (text) toast.error(t("emptyResult"));
        } catch (err) {
          if (!mountedRef.current) return;
          console.error("[useDictationRecorder] upload failed", err);
          toast.error(t("error"));
        } finally {
          if (mountedRef.current) setStatus("idle");
        }
        return;
      }

      const formData = new FormData();
      formData.append("audio", blob, `dictate.${blob.type.includes("ogg") ? "ogg" : "webm"}`);
      // Language hint = the UI locale. Whisper's auto-detect is unreliable on
      // short clips (a lone "bonjour" comes back as "hello") — pinning the
      // language keeps the transcription in the user's language, untranslated.
      formData.append("lang", locale);
      formData.append("context", context);
      if (feature) formData.append("feature", feature);
      if (!cleanupEnabled) formData.append("cleanup", "off");
      if (vocabularyJson !== "[]") formData.append("vocabulary", vocabularyJson);

      try {
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            retry_after?: number;
            error?: unknown;
          };
          if (res.status === 429) {
            const minutes = Math.max(1, Math.ceil((data.retry_after ?? 60) / 60));
            toast.error(t("rateLimitReached", { minutes }));
          } else if (res.status === 413) {
            toast.error(t("tooLarge"));
          } else if (res.status === 403 && typeof data.error === "string" && data.error) {
            // Plan limit (AI budget exhausted): the server already localized
            // a message that says more than "Transcription failed".
            toast.error(data.error);
          } else {
            toast.error(t("error"));
          }
          return;
        }
        const data = (await res.json()) as { text?: string; polished?: boolean };
        const text = (data.text ?? "").trim();
        if (!mountedRef.current) return;
        if (hasSpeech(text)) {
          onTranscriptionRef.current(text);
          setCompletedTakes((count) => count + 1);
          // `polished` is absent when the account turned the cleanup off.
          if (data.polished === false) toast.error(t("polishFailed"));
        } else {
          toast.error(t("emptyResult"));
        }
      } catch (err) {
        if (!mountedRef.current) return;
        console.error("[useDictationRecorder] transcribe failed", err);
        toast.error(t("error"));
      } finally {
        if (mountedRef.current) setStatus("idle");
      }
    },
    [cleanupEnabled, context, feature, locale, t, vocabularyJson],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      cleanup();
      setStatus("idle");
    }
  }, [cleanup]);

  const start = useCallback(async () => {
    if (status !== "idle" || recorderRef.current) return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      toast.error(t("notSupported"));
      return;
    }

    cancelledRef.current = false;
    setStatus("starting");
    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name ?? "";
      console.warn("[useDictationRecorder] getUserMedia failed", name, err);
      if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        toast.error(t("noDevice"));
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        toast.error(t("deviceBusy"));
      } else {
        toast.error(t("permissionDenied"));
      }
      if (mountedRef.current) setStatus("idle");
      return;
    }
    // Discarded (or unmounted) while the permission prompt was open.
    if (cancelledRef.current || !mountedRef.current) {
      mediaStream.getTracks().forEach((track) => track.stop());
      if (mountedRef.current) setStatus("idle");
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
      console.error("[useDictationRecorder] MediaRecorder init failed", err);
      mediaStream.getTracks().forEach((track) => track.stop());
      toast.error(t("notSupported"));
      setStatus("idle");
      return;
    }

    mimeRef.current = recorder.mimeType || mimeType || "audio/webm";
    chunksRef.current = [];

    // Speech gate — watch the mic's time-domain peaks while recording so a
    // silent take is dropped without an API round-trip (on silence, Whisper
    // hallucinates filler text instead of returning an empty transcript).
    speechRef.current = false;
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
        audioCtxRef.current = audioContext;
        void audioContext.resume().catch(() => {});
        const samples = new Uint8Array(analyser.fftSize);
        detectSpeech = () => {
          if (speechRef.current) return;
          analyser.getByteTimeDomainData(samples);
          for (const value of samples) {
            if (Math.abs(value - 128) >= SPEECH_PEAK_THRESHOLD) {
              speechRef.current = true;
              return;
            }
          }
        };
      }
    } catch {
      // No analyser — the gate stays open (see the onstop check).
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const blob = new Blob(chunks, { type: mimeRef.current });
      // Trust the "no speech" verdict only if the analyser actually ran — no
      // AudioContext or a suspended one reads as flat silence regardless of
      // what the mic picked up.
      const silent = !speechRef.current && audioCtxRef.current?.state === "running";
      const cancelled = cancelledRef.current;
      cleanup();
      if (!mountedRef.current) return;
      if (cancelled || blob.size === 0) {
        setStatus("idle");
        return;
      }
      if (silent) {
        toast.error(t("emptyResult"));
        setStatus("idle");
        return;
      }
      setStatus("processing");
      void transcribe(blob);
    };

    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setStream(mediaStream);
    setElapsedMs(0);
    setStatus("recording");
    recorder.start();

    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
      detectSpeech?.();
    }, 200);

    autoStopRef.current = setTimeout(() => {
      toast.info(t("maxReached"));
      stop();
    }, SAFETY_STOP_MS);
  }, [cleanup, status, stop, t, transcribe]);

  return {
    status,
    elapsedMs,
    stream,
    start: useCallback(() => void start(), [start]),
    stop,
    cancel,
    completedTakes,
  };
}
