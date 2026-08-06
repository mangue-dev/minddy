"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
  Switch,
  Textarea,
  cn,
  toast,
} from "mangue-ui";
import {
  AlertTriangle,
  ChevronLeft,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

import { AgentEventFeed } from "@/components/agent/agent-event-feed";
import { EmptyScene } from "@/components/empty-scene";
import { agentSessionStatusKey } from "@/components/agents/agent-session-status";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import {
  deleteRoutineApi,
  runRoutineNowApi,
  updateRoutineApi,
  type Routine,
} from "@/lib/routines-api";
import { routineRunsQueryKey, useRoutineRunsQuery } from "@/lib/use-routines-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { describeSchedule, weekdayName, type RoutineSchedule } from "@/lib/routine-schedule";
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
 * **L'en-tête suit celui des autres volets de détail** (conversation, pull
 * request, retour) : le titre seul sur sa ligne, aucune bordure sous lui — le
 * contenu respire jusqu'en haut — et les gestes regroupés dans un menu « … »
 * plutôt qu'alignés en boutons. Ce qui les distingue vraiment, l'interrupteur
 * actif/en pause, reste dehors : c'est un état, pas une action ponctuelle.
 *
 * La CADENCE sort de l'en-tête et vit avec les exécutions, là où elle répond à
 * la question qu'on se pose en lisant la liste des passages.
 *
 * **`last_error` se LIT.** C'est ce qui rend tenable l'absence de garde-fou de
 * dépense propre aux routines : un passage sauté faute de budget se dit ici,
 * avec le lien vers la facturation — pas seulement dans une colonne de la base.
 */
export function RoutineDetail({
  routine,
  isOwner,
  onBack,
  onChanged,
  onDeleted,
}: {
  routine: Routine;
  /** Les gestes (interrupteur, lancer, éditer, supprimer) sont au propriétaire
   *  seul — un bouton qui mène à un 403 ne s'affiche pas. */
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
  // Le fondu des bords, comme partout où un contenu déborde de sa boîte.
  const runsFade = useScrollFade<HTMLDivElement>("x");

  // Le passage le plus récent est ouvert par défaut : c'est celui qu'on vient
  // lire. La sélection suit la routine — changer de routine repart du sien.
  useEffect(() => {
    setSelectedRunId(null);
    setEditing(false);
  }, [routine.id]);
  const selectedRun: AgentRunSummary | null =
    runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;

  const cadence = describeSchedule(routineSchedule(routine), (key, values) => t(key, values), {
    locale,
    weekdayLabel: (d) => weekdayName(d, locale),
  });

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
      {/* ── En-tête : le titre, et rien d'autre sur sa ligne ─────────────
          Même géométrie que la conversation d'un agent et le volet d'une pull
          request (`px-4 pt-4 pb-2.5`, sans bordure) : le contenu monte jusqu'en
          haut au lieu d'être posé sous une barre. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tAgents("backToList")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{routine.title}</span>

        {isOwner ? (
          <div className="flex shrink-0 items-center gap-2">
            {/* L'interrupteur reste DEHORS : c'est l'état de la routine — elle
                tourne, ou elle est en pause —, pas un geste ponctuel qu'on va
                chercher dans un menu. */}
            <Switch
              checked={routine.enabled}
              disabled={busy}
              aria-label={t("enabledLabel")}
              onCheckedChange={(enabled) => void patch({ enabled })}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t("actionsLabel")}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={busy} onSelect={() => void runNow()}>
                  <Play className="size-4" />
                  {t("runNow")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setEditing((e) => !e)}>
                  <Pencil className="size-4" />
                  {editing ? t("stopEditing") : tCommon("edit")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" />
                  {tCommon("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

      {/* ── La cadence, hors de l'en-tête ───────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-1 px-4 pb-2">
        <p className="text-xs text-muted-foreground">
          {cadence}
          {nextAt && routine.enabled ? ` · ${t("nextRunAt", { date: nextAt })}` : ""}
          {!routine.enabled ? ` · ${t("paused")}` : ""}
        </p>

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

      {/* ── Exécutions précédentes ─────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pt-2 pb-1">
          <h3 className="text-xs font-medium text-muted-foreground">{t("previousRuns")}</h3>
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
            {/* Une pastille par passage : sa date et son état. Deux passages
                d'une même routine ne se distinguent que par là. */}
            <div
              ref={runsFade.ref}
              {...runsFade.scrollProps}
              className="flex shrink-0 gap-1 overflow-x-auto px-4 pb-2"
            >
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

/** La cadence d'une routine, telle que le calcul et la phrase l'attendent. */
function routineSchedule(routine: Routine): RoutineSchedule {
  return {
    frequency: routine.frequency,
    hour: routine.hour,
    minute: routine.minute,
    weekdays: routine.weekdays,
    daysOfMonth: routine.days_of_month,
    timezone: routine.timezone,
  };
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
 * L'édition d'une routine : son INSTRUCTION et sa cadence.
 *
 * Pas de champ « nom » — le titre est écrit par minddy à partir de
 * l'instruction, et réécrit dès qu'elle change. Pas de wizard rejoué non plus :
 * on ne repasse pas par quatre écrans pour déplacer une heure.
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
  const [prompt, setPrompt] = useState(routine.prompt);
  const [schedule, setSchedule] = useState<RoutineSchedule>(() => routineSchedule(routine));

  return (
    <div className="flex shrink-0 flex-col gap-3 px-4 py-3">
      <Textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={4}
        maxLength={20000}
        aria-label={t("promptLabel")}
        className="resize-none"
      />
      <p className="text-xs text-muted-foreground">{t("titleAutoHint")}</p>

      <RoutineScheduleFields value={schedule} onChange={setSchedule} />

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {tCommon("cancel")}
        </Button>
        <Button
          size="sm"
          disabled={busy || !prompt.trim()}
          onClick={() =>
            void onSave({
              prompt: prompt.trim(),
              frequency: schedule.frequency,
              hour: schedule.hour,
              minute: schedule.minute,
              // Les champs de jour n'existent QUE pour leur cadence : les
              // envoyer tous les deux ferait refuser la cadence.
              weekdays: schedule.frequency === "weekly" ? schedule.weekdays : [],
              daysOfMonth: schedule.frequency === "monthly" ? schedule.daysOfMonth : [],
              timezone: schedule.timezone,
            })
          }
        >
          {tCommon("save")}
        </Button>
      </div>
    </div>
  );
}
