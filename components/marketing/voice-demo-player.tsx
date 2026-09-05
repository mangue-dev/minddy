"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "mangue-ui/lib/utils";
import { ArrowDown, ArrowRight, Loader2, Mic, Square } from "lucide-react";
import { PriorityIndicator } from "@/components/issue-indicators";
import { DictateWaveform } from "@/components/ai-elements/dictate-waveform";
import { useAnalytics } from "@/lib/use-analytics";
import { durationBucket } from "@/lib/analytics-sanitize";
import {
  DEMO_AUDIO_BITS_PER_SECOND,
  DEMO_MAX_RECORDING_MS,
  DEMO_SAMPLE_IDS,
  DEMO_SAMPLE_KEYS,
  type DemoDictationResult,
  type DemoSampleId,
  type DemoTicket,
} from "@/lib/demo-dictation";
import type { IssuePriorityValue } from "@/lib/issue-validation";

/**
 * Dictation, playable on the landing, without account (MIN-150).
 *
 * This block replaces the static figure which told the dictation in two moments
 * side by side. She said the right thing and didn't make it feel: the
 * “aha” moment of the product is seeing the fields fill up on their own, and
 * no image shows this. Here the visitor speaks for five seconds — or plays a
 * sentence with one click if he doesn't have a microphone — and watch the ticket fill up.
 *
 * The ticket is DISPOSABLE: nothing is created, nothing is saved, the audio does not survive
 * not to the query (`app/api/demo/dictate/route.ts`).
 *
 * ## Three choices that hold the block
 *
 * **Example sentences are visible straight away**, not just after a refusal
 * microphone. This is the shortest path to the demonstration, and a visitor
 * in open space will not talk to its screen anyway.
 *
 * **Nothing about the product is redesigned**: `PriorityIndicator` and `DictateWaveform`
 * are the components of the app, and the field titles come from the same
 * catalogs (`Field`, `Priority`) — passed as props by the server component,
 * because these namespaces are not served to the client on the public site.
 *
 * **The portrait of the assignee arrives in the response**, in data URI drawn by
 * the server. Importing `UserAvatar` here would pull DiceBear (~40 KB) into the
 * landing bundle for an image that you only see after playing.
 */

/** Titles of fields and priorities, taken from the app catalogs. */
export interface VoiceDemoLabels {
  priority: string;
  dueDate: string;
  assignee: string;
  categories: string;
  priorities: Record<IssuePriorityValue, string>;
}

type Status = "idle" | "recording" | "processing" | "done";

/** The six pieces of the ticket, revealed one after the other. */
const REVEAL_STEPS = 6;
const REVEAL_STEP_MS = 220;
/** Typing speed of an example sentence — the time of a spoken sentence. */
const TYPING_STEP_MS = 26;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

/** A ticket ownership line, like in the panel of a real ticket. */
function Row({
  label,
  shown,
  children,
}: {
  label: string;
  shown: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium transition-all duration-300",
          shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        {children}
      </span>
    </div>
  );
}

export function VoiceDemoPlayer({ labels, embedded = false }: { labels: VoiceDemoLabels; embedded?: boolean }) {
  const t = useTranslations("Landing");
  const locale = useLocale();
  const { track } = useAnalytics();

  const [status, setStatus] = useState<Status>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [ticket, setTicket] = useState<DemoTicket | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  /** Start of current passage — serves the measured time slot. */
  const startedAtRef = useRef(0);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearInterval);
    timersRef.current = [];
  }, []);

  const stopStream = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimers();
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [clearTimers]);

  /** Unveil the ticket piece by piece — all at once in reduced movement. */
  const reveal = useCallback(() => {
    if (prefersReducedMotion()) {
      setRevealed(REVEAL_STEPS);
      return;
    }
    const timer = setInterval(() => {
      setRevealed((n) => {
        if (n + 1 >= REVEAL_STEPS) clearInterval(timer);
        return n + 1;
      });
    }, REVEAL_STEP_MS);
    timersRef.current.push(timer);
  }, []);

  /** Write the example sentence on the screen, as if it were being spoken. */
  const typeOut = useCallback((text: string) => {
    if (prefersReducedMotion()) {
      setTranscript(text);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let i = 0;
      const timer = setInterval(() => {
        i += 1;
        setTranscript(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(timer);
          resolve();
        }
      }, TYPING_STEP_MS);
      timersRef.current.push(timer);
    });
  }, []);

  const fail = useCallback(
    async (res: Response, input: "mic" | "sample") => {
      let reason = "failed";
      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
        setError(
          t("voiceDemoErrorRate", {
            minutes: Math.max(1, Math.ceil((data.retry_after ?? 3600) / 60)),
          }),
        );
        reason = "rate_limited";
      } else if (res.status === 422) {
        setError(t("voiceDemoErrorEmpty"));
        reason = "empty";
      } else {
        setError(t("voiceDemoErrorGeneric"));
        reason = `http_${res.status}`;
      }
      track("landing_voice_demo_failed", { input, reason });
    },
    [t, track],
  );

  const settle = useCallback(
    (result: DemoDictationResult, input: "mic" | "sample") => {
      setTranscript(result.transcript);
      setTicket(result.ticket);
      setStatus("done");
      setRevealed(0);
      reveal();
      // The MEASURED wait is that of the visitor — from the click to the completed ticket, the
      // sentence that is written understood, not just server latency.
      track("landing_voice_demo_completed", {
        input,
        duration_bucket: durationBucket(Date.now() - startedAtRef.current),
      });
    },
    [reveal, track],
  );

  /** An example sentence: it is written while the waiter puts it away. */
  const playSample = useCallback(
    async (id: DemoSampleId) => {
      if (status === "recording" || status === "processing") return;
      clearTimers();
      setError(null);
      setTicket(null);
      setRevealed(0);
      setTranscript("");
      setStatus("processing");
      startedAtRef.current = Date.now();
      track("landing_voice_demo_started", { input: "sample" });

      const request = fetch("/api/demo/dictate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sample: id,
          locale,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      try {
        await typeOut(t(DEMO_SAMPLE_KEYS[id]));
        const res = await request;
        if (!mountedRef.current) return;
        if (!res.ok) {
          await fail(res, "sample");
          setStatus("idle");
          return;
        }
        settle((await res.json()) as DemoDictationResult, "sample");
      } catch {
        if (!mountedRef.current) return;
        setError(t("voiceDemoErrorGeneric"));
        track("landing_voice_demo_failed", { input: "sample", reason: "network" });
        setStatus("idle");
      }
    },
    [clearTimers, fail, locale, settle, status, t, track, typeOut],
  );

  const send = useCallback(
    async (blob: Blob) => {
      const form = new FormData();
      form.append("audio", blob, blob.type.includes("ogg") ? "take.ogg" : "take.webm");
      form.append("locale", locale);
      form.append("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
      try {
        const res = await fetch("/api/demo/dictate", { method: "POST", body: form });
        if (!mountedRef.current) return;
        if (!res.ok) {
          await fail(res, "mic");
          setStatus("idle");
          return;
        }
        settle((await res.json()) as DemoDictationResult, "mic");
      } catch {
        if (!mountedRef.current) return;
        setError(t("voiceDemoErrorGeneric"));
        track("landing_voice_demo_failed", { input: "mic", reason: "network" });
        setStatus("idle");
      }
    },
    [fail, locale, settle, t, track],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    clearTimers();
    setError(null);
    setTicket(null);
    setRevealed(0);
    setTranscript("");

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(t(embedded ? "voiceDemoErrorMicEmbedded" : "voiceDemoErrorMic"));
      track("landing_voice_demo_failed", { input: "mic", reason: "unsupported" });
      return;
    }

    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t(embedded ? "voiceDemoErrorMicEmbedded" : "voiceDemoErrorMic"));
      track("landing_voice_demo_failed", { input: "mic", reason: "denied" });
      return;
    }
    if (!mountedRef.current) {
      mediaStream.getTracks().forEach((track) => track.stop());
      return;
    }

    const mimeType = pickRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(mediaStream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: DEMO_AUDIO_BITS_PER_SECOND,
      });
    } catch {
      mediaStream.getTracks().forEach((track) => track.stop());
      setError(t(embedded ? "voiceDemoErrorMicEmbedded" : "voiceDemoErrorMic"));
      track("landing_voice_demo_failed", { input: "mic", reason: "unsupported" });
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });
      chunksRef.current = [];
      clearTimers();
      stopStream();
      if (!mountedRef.current) return;
      if (blob.size === 0) {
        setError(t("voiceDemoErrorEmpty"));
        setStatus("idle");
        return;
      }
      setStatus("processing");
      void send(blob);
    };

    recorderRef.current = recorder;
    setStream(mediaStream);
    setElapsedMs(0);
    setStatus("recording");
    startedAtRef.current = Date.now();
    track("landing_voice_demo_started", { input: "mic" });
    recorder.start();

    // The timer, and the automatic stop: a public demo is paid for per time.
    // second of audio, and a sentence fits well into fifteen seconds.
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= DEMO_MAX_RECORDING_MS) stopRecording();
    }, 200);
    timersRef.current.push(timer);
  }, [clearTimers, embedded, send, stopRecording, stopStream, t, track]);

  const restart = useCallback(() => {
    clearTimers();
    setStatus("idle");
    setTicket(null);
    setTranscript("");
    setRevealed(0);
    setError(null);
  }, [clearTimers]);

  const busy = status === "recording" || status === "processing";
  const dueLabel =
    ticket?.dueDate &&
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${ticket.dueDate}T12:00:00`));

  return (
    <figure className={cn(embedded ? "text-foreground" : "rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8")}>
      {/* `[&>*]:min-w-0`: without it, a grid column takes the width of
          its longest content (the example sentences, in `nowrap`) and the
          page overflows horizontally on mobile. */}
      <div className={cn("grid gap-6 md:gap-8 [&>*]:min-w-0", embedded ? "md:grid-cols-2" : "md:grid-cols-[1fr_auto_1fr]")}>
        {/* ── What you say ───────────────────── ────────────────────── */}
        {embedded ? (
          <div className="relative flex h-[240px] flex-col items-center justify-center md:h-[320px]">
            <button type="button" onClick={status === "recording" ? stopRecording : startRecording}
              disabled={status === "processing"}
              aria-label={status === "recording" ? t("voiceDemoStop") : t("voiceDemoStart")}
              className="flex size-24 items-center justify-center rounded-full transition-colors hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current disabled:opacity-50 dark:hover:bg-white/5">
              {status === "processing" ? <Loader2 className="size-12 animate-spin motion-reduce:animate-none" strokeWidth={1.25} aria-hidden /> :
                status === "recording" ? <Square className="size-9" strokeWidth={1.25} aria-hidden /> :
                <Mic className="size-14" strokeWidth={1.25} aria-hidden />}
            </button>
            <div className="absolute inset-x-0 top-[calc(50%+3.5rem)] text-center text-sm" role="status">
              {error || (status === "recording" ? `${t("voiceDemoStop")} · ${formatTime(elapsedMs)}` : status === "processing" ? t("voiceDemoProcessing") : "")}
            </div>
            <p className="sr-only" aria-live="polite">{transcript}</p>
          </div>
        ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("voiceDemoSpoken")}
          </p>

          {/* THE TAKE (remade in MIN-254). It was a discreet bar with a
              32 px microphone inside, resuming the product dictation popover:
              in the app the gesture is known, on the landing no one saw
              that there was something to try.

              Three changes make the invitation to speak visible: the microphone is 56 px and bears the brand color in
              flat, it is the WHOLE box that triggers and not the pellet
              alone, and the title is an invitation to the imperative rather
              than a label. The ring that beats during recording says
              that it runs without having to read the timer.

              The button COVERS the box instead of containing it: the waveform
              is a `<div>` with its canvas, and a button only accepts
              phrasing content. The layer in `absolute inset-0` gives the same
              click target without lying on the HTML — and it bears the title
              accessible, since it is him, the button. */}
          <div
            className={cn(
              "group relative flex items-center gap-4 rounded-xl border p-4 transition-colors",
              status === "recording"
                ? "border-brand/50 bg-brand/5"
                : "border-border bg-muted/30 hover:border-brand/40 hover:bg-brand/5",
              status === "processing" && "opacity-70",
            )}
          >
            <button
              type="button"
              onClick={status === "recording" ? stopRecording : startRecording}
              disabled={status === "processing"}
              aria-label={status === "recording" ? t("voiceDemoStop") : t("voiceDemoStart")}
              className="absolute inset-0 z-10 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            />

            <span
              className={cn(
                "relative flex size-14 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition-transform",
                status !== "recording" && "group-hover:scale-105",
              )}
            >
              {status === "recording" && (
                <span
                  aria-hidden
                  className="absolute inset-0 animate-ping rounded-full bg-brand/40 motion-reduce:animate-none"
                />
              )}
              {status === "processing" ? (
                <Loader2 className="relative size-6 animate-spin" />
              ) : status === "recording" ? (
                <Square className="relative size-5 fill-current" />
              ) : (
                <Mic className="relative size-6" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              {status === "recording" ? (
                <>
                  <p className="flex items-baseline gap-2 text-sm font-semibold">
                    {t("voiceDemoStop")}
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {formatTime(elapsedMs)}
                    </span>
                  </p>
                  <DictateWaveform stream={stream} className="mt-1.5" />
                </>
              ) : (
                <>
                  <p className="text-base font-semibold">
                    {status === "processing" ? t("voiceDemoProcessing") : t("voiceDemoStart")}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {t("voiceDemoHint")}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* What was heard — or the example sentence, being written.
              Absent at rest: “We listen to you” when nothing listening would be
              wrong, and the empty place is visible. */}
          {(transcript || status === "recording") && (
            <blockquote aria-live="polite" className="text-[15px] leading-relaxed text-pretty">
              {transcript ? (
                <span className="decoration-brand/40 underline decoration-2 underline-offset-4">
                  {transcript}
                </span>
              ) : (
                <span className="text-muted-foreground">{t("voiceDemoListening")}</span>
              )}
            </blockquote>
          )}

          {error && (
            <p role="status" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {/* The path without a microphone: always there, never a hidden stopgap. */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t("voiceDemoSamples")}
            </p>
            <div className="flex flex-wrap gap-2">
              {DEMO_SAMPLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => void playSample(id)}
                  disabled={busy}
                  // Pastille truncated where the sentence fits (it fits there
                  // always), full line on mobile: a sentence cut into
                  // two no longer says what we are about to play.
                  className="max-w-full rounded-lg border border-border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:truncate sm:rounded-full"
                >
                  {t(DEMO_SAMPLE_KEYS[id])}
                </button>
              ))}
            </div>
          </div>
        </div>

        )}

        {/* Reading direction: to the right on the big screen, downwards otherwise. */}
        {!embedded && <div className="flex justify-center self-center text-muted-foreground" aria-hidden>
          <ArrowDown className="size-5 md:hidden" />
          <ArrowRight className="hidden size-5 md:block" />
        </div>}

        {/* The resulting issue preview. */}
        <div className={cn("flex flex-col gap-4", embedded && "h-[320px] overflow-y-auto p-1")}>
          {!embedded && <div className="flex items-baseline justify-between gap-4">
            <p className="text-xs font-medium text-muted-foreground">
              {t("voiceDemoResult")}
            </p>
            {status === "done" && (
              <button
                type="button"
                onClick={restart}
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("voiceDemoAgain")}
              </button>
            )}
          </div>}

          <div
            aria-live="polite"
            className="rounded-lg border border-border bg-background p-4"
          >
            {/* When idle, the card is not empty: it is the form that we
                would have filled by hand, waiting to be done alone. */}
            {ticket ? (
              <h4
                className={cn(
                  "mb-1 text-base leading-snug font-semibold transition-all duration-300",
                  revealed >= 1 ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                )}
              >
                {ticket.title}
              </h4>
            ) : (
              <p className="mb-1 text-base leading-snug font-medium text-muted-foreground">
                {t("voiceDemoWaiting")}
              </p>
            )}
            <p
              className={cn(
                "mb-3 min-h-10 text-sm leading-relaxed text-muted-foreground transition-all duration-300",
                ticket && revealed >= 2
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0",
              )}
            >
              {ticket?.description}
            </p>

            <Row label={labels.priority} shown={!!ticket && revealed >= 3}>
              {ticket && (
                <>
                  <PriorityIndicator priority={ticket.priority} />
                  {labels.priorities[ticket.priority]}
                </>
              )}
            </Row>
            <Row label={labels.dueDate} shown={!!ticket && revealed >= 4}>
              {dueLabel || "—"}
            </Row>
            <Row label={labels.assignee} shown={!!ticket && revealed >= 5}>
              {ticket?.assignee ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ticket.assignee.avatar}
                    alt=""
                    className="size-5 shrink-0 rounded-full"
                  />
                  {ticket.assignee.name}
                </>
              ) : (
                "—"
              )}
            </Row>
            <Row label={labels.categories} shown={!!ticket && revealed >= 6}>
              {ticket?.category?.name ?? "—"}
            </Row>
          </div>
          {embedded && status === "done" && <button type="button" onClick={restart}
            className="self-end rounded-sm text-xs underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">{t("voiceDemoAgain")}</button>}
        </div>
      </div>
    </figure>
  );
}
