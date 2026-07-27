"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "mangue-ui";

/**
 * Voice dictation for the task notebook — the same recording pipeline as the
 * shared <DictateButton> (getUserMedia + MediaRecorder, no time limit, silence
 * gate, POST /api/transcribe, `Dictate` i18n), but exposed as start/stop/cancel
 * so the caller can drive it from the `/` menu and stop on Enter.
 *
 * The transcript then goes through Numo (POST /api/me/scratchpad/dictate-task),
 * as a dictated ticket does: Whisper writes down speech — hesitations, random
 * punctuation, broken agreement — and the notebook wants a task one can re-read.
 * A dictation can hold several to-dos, hence a LIST of entries. If that step
 * fails the raw transcript is inserted anyway: a take is never lost.
 */

// Same guards as <DictateButton>: no time limit, only /api/transcribe's 10 MB
// payload ceiling. So the recorder is pinned to a speech bitrate and the safety
// stop lands well inside that budget — it exists so a tab left recording by
// accident still transcribes its take instead of losing it to a 413.
const AUDIO_BITS_PER_SECOND = 48_000; // ~6 KB/s → 10 MB ≈ 28 min
const SAFETY_STOP_MS = 20 * 60_000;
// Peak deviation from the analyser's 128 midline that counts as speech.
const SPEECH_PEAK_THRESHOLD = 20;
// Fin du carnet envoyée à Numo comme échantillon d'orthographe (la route en
// garde 3 000) — inutile de faire voyager une note de 64 ko à chaque prise.
const NOTE_SAMPLE_CHARS = 4000;

export type DictationStatus =
  | "idle"
  | "starting"
  | "recording"
  /** Audio → texte (/api/transcribe). */
  | "processing"
  /** Texte brut → tâches propres (Numo). */
  | "polishing";

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

export interface Dictation {
  status: DictationStatus;
  elapsedMs: number;
  stream: MediaStream | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
}

export function useDictation({
  onTasks,
  getNote,
}: {
  /** One dictation → one or more notebook entries, already cleaned up. */
  onTasks: (tasks: string[]) => void;
  /** The note as it stands — joined to the prompt so Numo spells the user's
      names, products and ticket ids the way they already write them. */
  getNote?: () => string;
}): Dictation {
  const t = useTranslations("Dictate");
  const tScratch = useTranslations("Scratchpad");
  const locale = useLocale();

  const [status, setStatus] = useState<DictationStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const onTasksRef = useRef(onTasks);
  onTasksRef.current = onTasks;
  const getNoteRef = useRef(getNote);
  getNoteRef.current = getNote;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mimeRef = useRef("audio/webm");
  const mountedRef = useRef(true);
  const speechRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelledRef = useRef(false);

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
      cleanup();
    };
  }, [cleanup]);

  /** Étape Numo : transcript brut → tâches propres. `tasks: null` = échec, et
   *  l'appelant insère alors le brut ; `message` porte l'explication déjà
   *  localisée du serveur quand il y en a une (budget d'usage épuisé). */
  const polish = useCallback(
    async (
      transcript: string
    ): Promise<{ tasks: string[] | null; message?: string }> => {
      try {
        const res = await fetch("/api/me/scratchpad/dictate-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            note: (getNoteRef.current?.() ?? "").slice(-NOTE_SAMPLE_CHARS),
          }),
        });
        if (!res.ok) {
          // 403 = limite de plan (budget d'usage IA épuisé) : dire laquelle vaut
          // mieux que « Numo n'a pas pu ».
          if (res.status === 403) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: unknown;
            };
            if (typeof data.error === "string" && data.error)
              return { tasks: null, message: data.error };
          }
          return { tasks: null };
        }
        const data = (await res.json()) as { tasks?: unknown };
        if (!Array.isArray(data.tasks)) return { tasks: null };
        const tasks = data.tasks
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean);
        return { tasks: tasks.length > 0 ? tasks : null };
      } catch (err) {
        console.error("[useDictation] polish failed", err);
        return { tasks: null };
      }
    },
    []
  );

  const sendForTranscription = useCallback(
    async (blob: Blob) => {
      const formData = new FormData();
      formData.append(
        "audio",
        blob,
        `dictate.${blob.type.includes("ogg") ? "ogg" : "webm"}`
      );
      // Language hint = the UI locale (Whisper's auto-detect is unreliable on
      // short clips).
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
          } else if (res.status === 403) {
            // Limite de plan (budget d'usage IA épuisé) — message déjà localisé
            // par le serveur, autrement plus parlant que « Échec ».
            const data = (await res.json().catch(() => ({}))) as {
              error?: unknown;
            };
            toast.error(
              typeof data.error === "string" && data.error ? data.error : t("error")
            );
          } else {
            toast.error(t("error"));
          }
          return;
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (!mountedRef.current) return;
        // A transcript with no letter or digit is Whisper's silence filler.
        if (!/[\p{L}\p{N}]/u.test(text)) {
          toast.error(t("emptyResult"));
          return;
        }
        setStatus("polishing");
        const { tasks, message } = await polish(text);
        if (!mountedRef.current) return;
        if (tasks) {
          onTasksRef.current(tasks);
        } else {
          // La prise est bonne, seule la mise au propre a échoué : on insère le
          // brut plutôt que de faire redire la phrase.
          onTasksRef.current([text]);
          toast.error(message ?? tScratch("dictationPolishFailed"));
        }
      } catch (err) {
        if (!mountedRef.current) return;
        console.error("[useDictation] transcribe failed", err);
        toast.error(t("error"));
      } finally {
        if (mountedRef.current) setStatus("idle");
      }
    },
    [locale, polish, t, tScratch]
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
    } catch {
      mediaStream.getTracks().forEach((track) => track.stop());
      toast.error(t("notSupported"));
      setStatus("idle");
      return;
    }

    mimeRef.current = recorder.mimeType || mimeType || "audio/webm";
    chunksRef.current = [];

    // Speech gate — drop a silent take without an API round-trip.
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
      // No analyser — the gate stays open.
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const blob = new Blob(chunks, { type: mimeRef.current });
      const silent =
        !speechRef.current && audioCtxRef.current?.state === "running";
      const cancelled = cancelledRef.current;
      cleanup();
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
      void sendForTranscription(blob);
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
  }, [cleanup, sendForTranscription, status, stop, t]);

  return {
    status,
    elapsedMs,
    stream,
    start: () => void start(),
    stop,
    cancel,
  };
}
