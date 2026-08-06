"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ConfirmDeleteDialog,
  Input,
  Skeleton,
  Switch,
  Textarea,
  cn,
  toast,
} from "mangue-ui";
import { AlertTriangle, ChevronLeft, Pencil, Play, Trash2, X } from "lucide-react";

import { AgentEventFeed } from "@/components/agent/agent-event-feed";
import { EmptyScene } from "@/components/empty-scene";
import { agentSessionStatusKey } from "@/components/agents/agent-session-status";
import {
  deleteRoutineApi,
  runRoutineNowApi,
  updateRoutineApi,
  type Routine,
} from "@/lib/routines-api";
import { routineRunsQueryKey, useRoutineRunsQuery } from "@/lib/use-routines-query";
import {
  describeSchedule,
  weekdayName,
  type RoutineFrequency,
} from "@/lib/routine-schedule";
import type { AgentRunSummary } from "@/lib/agent-api";

/**
 * Une ROUTINE (MIN-185) et ses « Exécutions précédentes ».
 *
 * C'est LE seul endroit où ses runs se lisent : ils sortent de la liste des
 * conversations, sinon une routine quotidienne y prendrait toute la place. Un
 * passage sélectionné se déroule dans le MÊME fil que n'importe quelle session
 * (`AgentEventFeed`, streaming compris) — un run de routine n'est pas un mode
 * dégradé.
 *
 * L'édition se fait ICI, champ par champ, et pas en rejouant le wizard : un
 * wizard est un parcours d'établissement, le rejouer pour changer une heure
 * ferait repasser par quatre écrans.
 *
 * **`last_error` se LIT.** C'est ce qui rend tenable l'absence de garde-fou de
 * dépense propre aux routines : un passage sauté faute de budget se dit dans
 * l'en-tête, avec le lien vers la facturation — pas seulement dans une colonne
 * de la base.
 */
export function RoutineDetail({
  routine,
  isOwner,
  onBack,
  onChanged,
  onDeleted,
}: {
  routine: Routine;
  /** Les cinq actions (interrupteur, lancer, éditer, supprimer) sont au
   *  propriétaire seul — un bouton qui mène à un 403 ne s'affiche pas. */
  isOwner: boolean;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("Routines");
  const tAgents = useTranslations("Agents");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const format = useFormatter();
  const queryClient = useQueryClient();

  const { runs, loading } = useRoutineRunsQuery(routine.id);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Le passage le plus récent est ouvert par défaut : c'est celui qu'on vient
  // lire. La sélection suit la routine — changer de routine repart du sien.
  useEffect(() => {
    setSelectedRunId(null);
    setEditing(false);
  }, [routine.id]);
  const selectedRun: AgentRunSummary | null =
    runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;

  const cadence = describeSchedule(
    {
      frequency: routine.frequency,
      hour: routine.hour,
      minute: routine.minute,
      weekday: routine.weekday,
      dayOfMonth: routine.day_of_month,
      timezone: routine.timezone,
    },
    (key, values) => t(key, values),
    { locale, weekdayLabel: (d) => weekdayName(d, locale) },
  );

  const nextAt = routine.next_run_at
    ? format.dateTime(new Date(routine.next_run_at), {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const patch = async (fields: Parameters<typeof updateRoutineApi>[1]) => {
    setBusy(true);
    try {
      await updateRoutineApi(routine.id, fields);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      await runRoutineNowApi(routine.id);
      // Le passage vient de naître : la liste des exécutions ne le connaît pas
      // encore, et elle ne poll qu'à partir du moment où elle en a un.
      await queryClient.invalidateQueries({ queryKey: routineRunsQueryKey(routine.id) });
      toast.success(t("runStarted"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteRoutineApi(routine.id);
      onDeleted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── En-tête : ce que la routine EST, et ce qu'on peut lui faire ── */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tAgents("backToList")}
            className="md:hidden"
            onClick={onBack}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {routine.title}
          </span>
          {isOwner ? (
            <div className="flex shrink-0 items-center gap-1">
              <Switch
                checked={routine.enabled}
                disabled={busy}
                aria-label={t("enabledLabel")}
                onCheckedChange={(enabled) => void patch({ enabled })}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label={t("runNow")}
                title={t("runNow")}
                onClick={() => void runNow()}
              >
                <Play className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={editing ? tCommon("cancel") : tCommon("edit")}
                onClick={() => setEditing((e) => !e)}
              >
                {editing ? <X className="size-4" /> : <Pencil className="size-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tCommon("delete")}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {cadence}
          {nextAt && routine.enabled ? ` · ${t("nextRunAt", { date: nextAt })}` : ""}
          {!routine.enabled ? ` · ${t("paused")}` : ""}
        </p>

        {/* Le passage manqué, en clair. Sans cette ligne, un budget épuisé ne se
            lirait que dans une colonne de la base — et la routine aurait l'air
            de ne rien faire pour une raison inconnue. */}
        {routine.last_error ? (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{routineErrorLabel(routine.last_error, t)}</span>
            {routine.last_error === "quota" ? (
              <Link href="/settings/billing" className="underline underline-offset-2">
                {t("seeBilling")}
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>

      {editing && isOwner ? (
        <RoutineEditor
          routine={routine}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (fields) => {
            await patch(fields);
            setEditing(false);
          }}
        />
      ) : null}

      {/* ── Exécutions précédentes ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pt-3 pb-1">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("previousRuns")}
          </h3>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2 px-4 py-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-8 rounded-md" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyScene icon={Play} title={t("noRunsYet")} size="compact" />
          </div>
        ) : (
          <>
            {/* Une ligne par passage : sa date et son issue. Deux passages d'une
                même routine ne se distinguent que par là. */}
            <div className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                    selectedRun?.id === run.id
                      ? "border-brand/50 bg-muted"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {format.dateTime(new Date(run.created_at), {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "numeric",
                  })}
                  {" · "}
                  {tAgents(
                    agentSessionStatusKey({
                      status: run.status,
                      prNumber: run.pr_number,
                      prState: run.pr_state,
                    }),
                  )}
                </button>
              ))}
            </div>

            {selectedRun ? (
              <AgentEventFeed
                key={selectedRun.id}
                runId={selectedRun.id}
                status={selectedRun.status}
                prompt={selectedRun.prompt}
                className="min-h-0 flex-1"
              />
            ) : null}
          </>
        )}
      </div>

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("deleteTitle", { title: routine.title })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/** Le motif d'un passage manqué, en une phrase. Le CODE vient du serveur. */
function routineErrorLabel(
  code: string,
  t: (key: "lastError_quota", values?: Record<string, string>) => string,
): string {
  switch (code) {
    case "quota":
      return t("lastError_quota");
    case "noRepo":
      return t("lastError_noRepo" as "lastError_quota");
    case "alreadyRunning":
      return t("lastError_alreadyRunning" as "lastError_quota");
    case "modelAbovePlan":
      return t("lastError_modelAbovePlan" as "lastError_quota");
    default:
      return t("lastError_launchFailed" as "lastError_quota");
  }
}

/**
 * L'édition, champ par champ — l'instruction, le titre, la cadence. Pas de
 * wizard rejoué : on ne repasse pas par quatre écrans pour déplacer une heure.
 */
function RoutineEditor({
  routine,
  busy,
  onCancel,
  onSave,
}: {
  routine: Routine;
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: Parameters<typeof updateRoutineApi>[1]) => Promise<void>;
}) {
  const t = useTranslations("Routines");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const [title, setTitle] = useState(routine.title);
  const [prompt, setPrompt] = useState(routine.prompt);
  const [frequency, setFrequency] = useState<RoutineFrequency>(routine.frequency);
  const [hour, setHour] = useState(routine.hour);
  const [minute, setMinute] = useState(routine.minute);
  const [weekday, setWeekday] = useState(routine.weekday ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(routine.day_of_month ?? 1);
  const [timezone, setTimezone] = useState(routine.timezone);

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        aria-label={t("titleLabel")}
        className="h-9"
      />
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        maxLength={20000}
        aria-label={t("promptLabel")}
        className="resize-none"
      />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("frequencyLabel")}
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RoutineFrequency)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            {(["daily", "weekly", "monthly"] as const).map((f) => (
              <option key={f} value={f}>
                {t(`frequency_${f}` as "frequency_daily")}
              </option>
            ))}
          </select>
        </label>
        {frequency === "weekly" ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("weekdayLabel")}
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {weekdayName(d, locale)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {frequency === "monthly" ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("dayOfMonthLabel")}
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("timeLabel")}
          <Input
            type="time"
            value={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":");
              if (h !== undefined) setHour(Number(h) || 0);
              if (m !== undefined) setMinute(Number(m) || 0);
            }}
            className="h-9 w-28"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("timezoneLabel")}
          <Input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value.trim())}
            className="h-9 w-44"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {tCommon("cancel")}
        </Button>
        <Button
          size="sm"
          disabled={busy || !title.trim() || !prompt.trim()}
          onClick={() =>
            void onSave({
              title: title.trim(),
              prompt: prompt.trim(),
              frequency,
              hour,
              minute,
              // Les champs de jour n'existent QUE pour leur cadence : les
              // envoyer tous les deux ferait refuser la cadence.
              weekday: frequency === "weekly" ? weekday : null,
              dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
              timezone,
            })
          }
        >
          {tCommon("save")}
        </Button>
      </div>
    </div>
  );
}
