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
 * La dictée, jouable sur la landing, sans compte (MIN-150).
 *
 * Ce bloc remplace la figure statique qui racontait la dictée en deux instants
 * côte à côte. Elle disait la bonne chose et ne la faisait pas ressentir : le
 * moment « aha » du produit, c'est de voir les champs se remplir tout seuls, et
 * aucune image ne montre ça. Ici le visiteur parle cinq secondes — ou joue une
 * phrase d'un clic s'il n'a pas de micro — et regarde le ticket se remplir.
 *
 * Le ticket est JETABLE : rien n'est créé, rien n'est gardé, l'audio ne survit
 * pas à la requête (`app/api/demo/dictate/route.ts`).
 *
 * ## Trois choix qui tiennent le bloc
 *
 * **Les phrases d'exemple sont visibles d'emblée**, pas seulement après un refus
 * de micro. C'est le chemin le plus court vers la démonstration, et un visiteur
 * en open space ne parlera de toute façon pas à son écran.
 *
 * **Rien du produit n'est redessiné** : `PriorityIndicator` et `DictateWaveform`
 * sont les composants de l'app, et les intitulés de champs viennent des mêmes
 * catalogues (`Field`, `Priority`) — passés en props par le composant serveur,
 * parce que ces namespaces-là ne sont pas servis au client sur le site public.
 *
 * **Le portrait de l'assigné arrive dans la réponse**, en data URI dessinée par
 * le serveur. Importer `UserAvatar` ici tirerait DiceBear (~40 Ko) dans le
 * bundle de la landing pour une image qu'on ne voit qu'après avoir joué.
 */

/** Intitulés de champs et de priorités, repris des catalogues de l'app. */
export interface VoiceDemoLabels {
  priority: string;
  dueDate: string;
  assignee: string;
  categories: string;
  priorities: Record<IssuePriorityValue, string>;
}

type Status = "idle" | "recording" | "processing" | "done";

/** Les six morceaux du ticket, dévoilés l'un après l'autre. */
const REVEAL_STEPS = 6;
const REVEAL_STEP_MS = 220;
/** Vitesse de frappe d'une phrase d'exemple — le temps d'une phrase parlée. */
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

/** Une ligne de propriété du ticket, comme dans le panneau d'un vrai ticket. */
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

export function VoiceDemoPlayer({ labels }: { labels: VoiceDemoLabels }) {
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
  /** Départ du passage en cours — sert la tranche de durée mesurée. */
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

  /** Dévoile le ticket morceau par morceau — d'un coup en mouvement réduit. */
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

  /** Écrit la phrase d'exemple à l'écran, comme si elle était dite. */
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
      // L'attente MESURÉE est celle du visiteur — du clic au ticket rempli, la
      // phrase qui s'écrit comprise, pas la seule latence du serveur.
      track("landing_voice_demo_completed", {
        input,
        duration_bucket: durationBucket(Date.now() - startedAtRef.current),
      });
    },
    [reveal, track],
  );

  /** Une phrase d'exemple : elle s'écrit pendant que le serveur la range. */
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
      setError(t("voiceDemoErrorMic"));
      track("landing_voice_demo_failed", { input: "mic", reason: "unsupported" });
      return;
    }

    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t("voiceDemoErrorMic"));
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
      setError(t("voiceDemoErrorMic"));
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

    // Le chrono, et l'arrêt automatique : une démo publique se paye à la
    // seconde d'audio, et une phrase tient largement dans quinze secondes.
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= DEMO_MAX_RECORDING_MS) stopRecording();
    }, 200);
    timersRef.current.push(timer);
  }, [clearTimers, send, stopRecording, stopStream, t, track]);

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
    <figure className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
      {/* `[&>*]:min-w-0` : sans lui, une colonne de grille prend la largeur de
          son contenu le plus long (les phrases d'exemple, en `nowrap`) et la
          page déborde à l'horizontale sur mobile. */}
      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:gap-8 [&>*]:min-w-0">
        {/* ── Ce que vous dites ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("voiceDemoSpoken")}
          </p>

          {/* La prise : même géométrie que le popover de dictée du produit. */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <button
              type="button"
              onClick={status === "recording" ? stopRecording : startRecording}
              disabled={status === "processing"}
              aria-label={status === "recording" ? t("voiceDemoStop") : t("voiceDemoStart")}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
                status === "recording"
                  ? "bg-brand text-brand-foreground"
                  : "bg-brand/10 text-brand hover:bg-brand/20",
              )}
            >
              {status === "processing" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : status === "recording" ? (
                <Square className="size-3.5 fill-current" />
              ) : (
                <Mic className="size-4" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              {status === "recording" ? (
                <>
                  <div className="flex items-center justify-center text-xs">
                    <span className="font-medium tabular-nums text-foreground">
                      {formatTime(elapsedMs)}
                    </span>
                  </div>
                  <DictateWaveform stream={stream} className="mt-1.5" />
                </>
              ) : (
                <div className="flex h-[46px] flex-col justify-center">
                  <p className="text-sm font-medium">
                    {status === "processing"
                      ? t("voiceDemoProcessing")
                      : t("voiceDemoStart")}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("voiceDemoHint")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Ce qui a été entendu — ou la phrase d'exemple, en train de s'écrire.
              Absent au repos : « On vous écoute » quand rien n'écoute serait
              faux, et la place vide se voit. */}
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

          {/* Le chemin sans micro : toujours là, jamais un pis-aller caché. */}
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
                  // Pastille tronquée là où la phrase tient (elle y tient
                  // toujours), ligne pleine sur mobile : une phrase coupée en
                  // deux ne dit plus ce qu'on s'apprête à jouer.
                  className="max-w-full rounded-lg border border-border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:truncate sm:rounded-full"
                >
                  {t(DEMO_SAMPLE_KEYS[id])}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Le sens de lecture : à droite sur grand écran, vers le bas sinon. */}
        <div className="flex justify-center self-center text-muted-foreground" aria-hidden>
          <ArrowDown className="size-5 md:hidden" />
          <ArrowRight className="hidden size-5 md:block" />
        </div>

        {/* ── Ce que minddy en fait ─────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
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
          </div>

          <div
            aria-live="polite"
            className="rounded-lg border border-border bg-background p-4"
          >
            {/* Au repos, la carte n'est pas vide : c'est le formulaire qu'on
                aurait rempli à la main, en attente de l'être tout seul. */}
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
        </div>
      </div>

      <figcaption className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground">
        {t("voiceDemoCaption")}
      </figcaption>
    </figure>
  );
}
