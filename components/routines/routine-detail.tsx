"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Badge,
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
  ChevronRight,
  GitPullRequest,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

import { AgentConversation } from "@/components/agent/agent-conversation";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { EmptyScene } from "@/components/empty-scene";
import { ProjectOrb } from "@/components/project-orb";
import {
  PR_STATE_STYLES,
  PrStateBadge,
} from "@/components/pull-requests/pr-state-badge";
import { agentSessionStatusKey } from "@/components/agents/agent-session-status";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import {
  deleteRoutineApi,
  runRoutineNowApi,
  updateRoutineApi,
  type Routine,
} from "@/lib/routines-api";
import {
  routineRunsQueryKey,
  useRoutineRunsQuery,
} from "@/lib/use-routines-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import {
  describeSchedule,
  weekdayName,
  type RoutineSchedule,
} from "@/lib/routine-schedule";
import type { AgentRunSummary } from "@/lib/agent-api";

/**
 * Une ROUTINE (MIN-185) et ses « Exécutions précédentes ».
 *
 * C'est LE seul endroit où ses runs se lisent : ils sortent de la liste des
 * conversations, sinon une routine quotidienne y prendrait toute la place.
 *
 * **Deux niveaux, pas un.** La routine montre la LISTE de ses passages — une
 * ligne pleine largeur par passage, sa date et l'état de sa pull request. Ouvrir
 * une ligne ouvre la VRAIE conversation de ce run (`AgentConversation`, celle-là
 * même que l'onglet Conversations sert) : le fil, le diff, la pull request, et
 * le composer pour lui répondre. Un run de routine n'est pas un mode dégradé —
 * il se poursuit comme n'importe quelle session, simplement depuis l'onglet
 * Routines.
 *
 * L'en-tête suit ce qu'on regarde : le titre de la routine et ses réglages sur
 * la liste, la DATE du passage et un retour dans la conversation. Le reste des
 * gestes de routine (l'interrupteur, le menu) n'y a rien à faire : on ne règle
 * pas une cadence en lisant ce qu'un passage a produit.
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
  project,
  isOwner,
  onBack,
  onChanged,
  onDeleted,
}: {
  routine: Routine;
  /** Le projet porteur — son orbe ouvre l'en-tête, comme sur une conversation :
   *  « de quel dépôt parle-t-on ? » est la question qu'on se pose en arrivant. */
  project: { id: string; icon_url: string | null } | null;
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
  const router = useRouter();
  const queryClient = useQueryClient();

  const { runs, loading } = useRoutineRunsQuery(routine.id);
  /**
   * Le passage OUVERT, ou `null` — c'est lui, et lui seul, qui décide de ce que
   * ce volet montre : la liste des passages, ou la conversation de l'un d'eux.
   * Rien n'est ouvert par défaut : arriver sur une routine, c'est vouloir voir
   * ce qu'elle est et ce qu'elle a fait, pas relire un fil en particulier.
   */
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // Le fondu du bas de la liste, comme partout où un contenu déborde.
  const listFade = useScrollFade<HTMLDivElement>();

  // Changer de routine referme ce qu'on lisait de la précédente.
  useEffect(() => {
    setOpenRunId(null);
    setEditing(false);
  }, [routine.id]);
  const openRun: AgentRunSummary | null =
    runs.find((r) => r.id === openRunId) ?? null;

  const cadence = describeSchedule(
    routineSchedule(routine),
    (key, values) => t(key, values),
    {
      locale,
      weekdayLabel: (d) => weekdayName(d, locale),
    },
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
      await queryClient.invalidateQueries({
        queryKey: routineRunsQueryKey(routine.id),
      });
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

  /**
   * UN PASSAGE OUVERT : la vraie conversation de ce run — le même composant que
   * l'onglet Conversations sert, avec son fil, son diff, sa pull request et son
   * composer. On peut donc RÉPONDRE à un passage de routine : il reprend là où
   * il s'est arrêté, comme n'importe quelle session.
   *
   * L'en-tête ne porte plus que ce qui vaut ici : le retour vers la liste des
   * passages, et la DATE de celui-ci à la place du titre. Ni interrupteur ni
   * menu — on ne règle pas une cadence en lisant ce qu'un passage a produit.
   *
   * À droite, la conversation pose elle-même le DIFF ; la pull request, elle,
   * vient de l'hôte (`headerActions`), exactement comme sur la page Agents :
   * `AgentConversation` ne sait proposer que d'en CRÉER une, jamais d'ouvrir
   * celle qui existe — c'est au volet qui l'accueille de savoir où elle se lit.
   */
  if (openRun) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <AgentConversation
          key={openRun.id}
          noteRunId={openRun.id}
          active
          headerTitle={
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("backToRuns")}
                onClick={() => setOpenRunId(null)}
              >
                <ChevronLeft />
              </Button>
              {project ? (
                <ProjectOrb
                  seed={project.id}
                  iconUrl={project.icon_url}
                  className="size-4 shrink-0"
                />
              ) : null}
              <span className="truncate text-sm font-medium">
                {format.dateTime(new Date(openRun.created_at), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          }
          headerActions={<PrHeaderAction run={openRun} />}
        />
      </div>
    );
  }

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
        {project ? (
          <ProjectOrb
            seed={project.id}
            iconUrl={project.icon_url}
            className="size-4 shrink-0"
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {routine.title}
        </span>

        {/* L'ÉTAT, à côté du geste qui le change — et un badge, pas une glose en
            fin de ligne de cadence : « cette routine ne tourne plus » est la
            première chose à voir en arrivant, pas la dernière à lire. Rien
            quand elle tourne : l'absence d'alerte EST l'état normal, et un
            badge « active » sur chaque routine ne distinguerait plus rien.
            Hors du bloc propriétaire : un membre ne peut pas la relancer, mais
            il doit savoir qu'elle dort. */}
        {!routine.enabled ? (
          <Badge
            variant="secondary"
            icon={<PauseCircle />}
            // L'ambre des badges de mise en garde du produit (le « Privé » d'un
            // retour) : un état qui n'est pas une erreur, mais qu'on ne veut pas
            // découvrir en se demandant pourquoi rien ne s'est passé.
            className="shrink-0 border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400"
          >
            {t("paused")}
          </Badge>
        ) : null}

        {isOwner ? (
          <div className="flex shrink-0 items-center gap-2">
            {/* L'interrupteur reste DEHORS : c'est l'état de la routine — elle
                tourne, ou elle est en pause —, pas un geste ponctuel qu'on va
                chercher dans un menu. */}
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {t("enabledLabel")}
              <Switch
                checked={routine.enabled}
                disabled={busy}
                onCheckedChange={(enabled) => void patch({ enabled })}
              />
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("actionsLabel")}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => void runNow()}
                >
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

      {/* ── La cadence, puis CE QU'ELLE FAIT ────────────────────────────
          L'instruction sous la cadence : sans elle, une routine n'était qu'un
          titre de trois mots et une heure, tout tassé en haut de l'écran — et
          « ce qu'elle fait » était précisément ce qu'on venait vérifier. */}
      <div className="flex shrink-0 flex-col gap-1 px-4 pb-2">
        <p className="text-xs text-muted-foreground">
          {cadence}
          {nextAt && routine.enabled
            ? ` · ${t("nextRunAt", { date: nextAt })}`
            : ""}
        </p>

        {routine.last_error ? (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{routineErrorLabel(routine.last_error, t)}</span>
            {routine.last_error === "quota" ? (
              <Link
                href="/settings/billing"
                className="underline underline-offset-2"
              >
                {t("seeBilling")}
              </Link>
            ) : null}
          </p>
        ) : null}

        {/* L'instruction, coupée par le CSS et non par un compteur de
            caractères : la plupart des routines tiennent en entier, et celles
            qui débordent s'arrêtent sur une ligne pleine avec des points de
            suspension, jamais au milieu d'un mot. Masquée en édition — le
            champ juste au-dessus porte déjà le texte complet, et modifiable. */}
        {editing && isOwner ? null : (
          <p className="mt-1 line-clamp-6 text-sm whitespace-pre-line text-muted-foreground">
            {routine.prompt}
          </p>
        )}
      </div>

      {/* ── Exécutions précédentes : UNE LIGNE par passage ─────────────
          Pleine largeur, sa date et l'état de sa pull request. Pas le fil :
          empiler des conversations dans une liste rend les deux illisibles.
          Ouvrir une ligne ouvre le fil, à sa place.

          Absentes pendant l'ÉDITION : on règle la routine ou on lit ce qu'elle
          a produit, jamais les deux en même temps — et le formulaire a besoin
          de toute la hauteur pour ne pas se lire au défilement. */}
      {editing && isOwner ? null : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-2 pb-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t("previousRuns")}
            </h3>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2 px-4 py-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="px-4 py-8">
              {/* Le geste EST là où le vide se constate : « elle n'a pas encore
                tourné » appelle « alors fais-la tourner », pas un détour par le
                menu. Réservé au propriétaire, comme le reste. */}
              <EmptyScene icon={Play} title={t("noRunsYet")} size="compact">
                {isOwner ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void runNow()}
                  >
                    <Play className="size-4" />
                    {t("runNow")}
                  </Button>
                ) : null}
              </EmptyScene>
            </div>
          ) : (
            <div
              ref={listFade.ref}
              {...listFade.scrollProps}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <ul className="flex flex-col divide-y divide-border border-t border-border">
                {runs.map((run) => (
                  /* La ligne entière ouvre le passage — sauf le badge de pull
                   request, qui mène à la PR. D'où le bouton ÉTENDU sous la
                   ligne plutôt qu'autour d'elle : un bouton dans un bouton n'est
                   pas du HTML valide, et le badge doit rester cliquable pour
                   lui-même. Les éléments `relative` qui suivent se peignent
                   au-dessus de lui et gardent leurs propres clics. */
                  <li
                    key={run.id}
                    className="relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 focus-within:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenRunId(run.id)}
                      aria-label={t("openRun", {
                        date: format.dateTime(new Date(run.created_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                      className="absolute inset-0 outline-none"
                    />
                    <span className="pointer-events-none relative min-w-0 flex-1 truncate text-sm">
                      {format.dateTime(new Date(run.created_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    {/* L'ÉTAT de la pull request quand il y en a une — c'est ce
                      qu'un passage produit de visible, et c'est aussi le chemin
                      vers elle. Sinon l'état du run, qui répond à la même
                      question d'un cran plus bas. */}
                    {run.pr_state ? (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/pull-requests?run=${run.id}`)
                        }
                        className="relative shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <PrStateBadge state={run.pr_state} icon />
                      </button>
                    ) : (
                      <span className="pointer-events-none relative shrink-0 text-xs text-muted-foreground">
                        {tAgents(
                          agentSessionStatusKey({
                            status: run.status,
                            prNumber: run.pr_number,
                            prState: run.pr_state,
                          }),
                        )}
                      </span>
                    )}
                    <ChevronRight className="pointer-events-none relative size-4 shrink-0 text-muted-foreground" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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

/**
 * Ce que l'en-tête d'un passage montre de sa pull request — même règle que sur
 * la page Agents : une PR VIVANTE est une action (« Ouvrir la pull request »),
 * une PR FINIE est un état (le badge, cliquable — la PR se consulte encore).
 * Aucune PR : rien, et la conversation propose alors d'en créer une.
 */
function PrHeaderAction({ run }: { run: AgentRunSummary }) {
  const t = useTranslations("Agents");
  const router = useRouter();
  if (run.pr_number == null) return null;
  const closed =
    run.pr_state === "merged" || run.pr_state === "closed"
      ? run.pr_state
      : null;
  const open = () => router.push(`/pull-requests?run=${run.id}`);
  return closed ? (
    <button
      type="button"
      onClick={open}
      className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PrStateBadge state={closed} icon />
    </button>
  ) : (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={open}
      className={cn(run.pr_state === "open" && PR_STATE_STYLES.open)}
    >
      <GitPullRequest className="size-3.5" />
      {t("openPullRequest")}
    </Button>
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
  const [schedule, setSchedule] = useState<RoutineSchedule>(() =>
    routineSchedule(routine),
  );

  return (
    <div className="flex shrink-0 flex-col gap-3 px-4 py-3">
      {/* Le MÊME champ que l'étape `job` du wizard, dictée comprise : on
          réécrit une instruction dans les mêmes conditions qu'on l'a écrite. */}
      <div className="relative">
        <Textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t("promptPlaceholder")}
          aria-label={t("promptLabel")}
          maxLength={20000}
          rows={6}
          className="min-h-36 resize-none pb-12"
        />
        <DictateButton
          floating
          disabled={busy}
          onTranscription={(text) =>
            setPrompt((current) =>
              current.trim() ? `${current.trim()} ${text}` : text,
            )
          }
        />
      </div>
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
              weekdays:
                schedule.frequency === "weekly" ? schedule.weekdays : [],
              daysOfMonth:
                schedule.frequency === "monthly" ? schedule.daysOfMonth : [],
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
