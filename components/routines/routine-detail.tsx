"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";
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
import { EmptyScene } from "@/components/empty-scene";
import { Markdown } from "@/components/markdown";
import { ModelBadge } from "@/components/model-badge";
import { ProjectOrb } from "@/components/project-orb";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import {
  PR_STATE_STYLES,
  PrStateBadge,
} from "@/components/pull-requests/pr-state-badge";
import { agentSessionStatusKey } from "@/components/agents/agent-session-status";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { RoutinePromptField } from "@/components/routines/routine-prompt-field";
import { SettingsRow } from "@/components/settings/settings-ui";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import { SpendCapCombobox } from "@/components/routines/spend-cap-combobox";
import { DEFAULT_MAX_SPEND_PERCENT } from "@/lib/routine-budget";
import {
  deleteRoutineApi,
  runRoutineNowApi,
  updateRoutineApi,
  type Routine,
} from "@/lib/routines-api";
import {
  patchRoutineInCache,
  routineRunsQueryKey,
  routinesQueryKey,
  useRoutineRunsQuery,
} from "@/lib/use-routines-query";
import { useAgentModelsQuery, useReasoningLevelsFor } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { nearestReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import { calendarDaysBetween } from "@/lib/due-date";
import {
  describeSchedule,
  nextRunAt,
  weekdayName,
  type RoutineSchedule,
} from "@/lib/routine-schedule";
import type { AgentRunSummary } from "@/lib/agent-api";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
 * **`last_error` se LIT.** Un passage sauté faute de budget se dit ici, avec le
 * lien vers la facturation — pas seulement dans une colonne de la base. Un
 * passage qui, lui, est PARTI et s'est arrêté sur son plafond de dépense le dit
 * dans sa conversation, à la fin de son fil : c'est un travail interrompu, pas
 * un rendez-vous manqué, et il a des choses à montrer.
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
  project: { id: string; icon_url: string | null; orb_seed: string | null } | null;
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
  /**
   * Le BROUILLON d'édition, ou `null` quand on lit. Il vit ICI et non dans le
   * formulaire parce que « Enregistrer » a quitté le bas du formulaire pour
   * l'en-tête, où il prend la place de l'interrupteur : le bouton et les champs
   * ne sont plus dans le même composant, et c'est le volet qui les tient tous
   * les deux.
   *
   * Sa présence EST le mode : plus de booléen `editing` à tenir d'accord avec
   * lui.
   */
  const [draft, setDraft] = useState<RoutineDraft | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // Le fondu du bas de la liste, comme partout où un contenu déborde.
  const listFade = useScrollFade<HTMLDivElement>();

  const editing = draft !== null && isOwner;

  // Changer de routine referme ce qu'on lisait de la précédente.
  useEffect(() => {
    setOpenRunId(null);
    setDraft(null);
  }, [routine.id]);
  const openRun: AgentRunSummary | null =
    runs.find((r) => r.id === openRunId) ?? null;

  /**
   * Le prochain passage se lit dans la LISTE des exécutions, en tête — c'est
   * une date de la même série que celles d'en dessous, simplement pas encore
   * arrivée. Une routine en pause n'en a pas : son échéance est désarmée
   * (`next_run_at` null), et en annoncer une serait un mensonge à l'écran.
   */
  const nextRunAtIso = routine.enabled ? routine.next_run_at : null;

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

  /**
   * Enregistre le brouillon. Les champs de JOUR n'existent que pour leur
   * cadence : les envoyer tous les deux ferait refuser la cadence côté serveur.
   */
  const saveDraft = async () => {
    if (!draft || !draft.prompt.trim()) return;
    await patch({
      prompt: draft.prompt.trim(),
      model: draft.model || null,
      reasoningLevel: draft.reasoning,
      baseBranch: draft.baseBranch || null,
      maxSpendPercent: draft.spendCap,
      frequency: draft.schedule.frequency,
      hour: draft.schedule.hour,
      minute: draft.schedule.minute,
      weekdays: draft.schedule.frequency === "weekly" ? draft.schedule.weekdays : [],
      daysOfMonth:
        draft.schedule.frequency === "monthly" ? draft.schedule.daysOfMonth : [],
      timezone: draft.schedule.timezone,
    });
    setDraft(null);
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

  /**
   * L'interrupteur bascule TOUT DE SUITE.
   *
   * C'est un ÉTAT, et un état se renverse d'un doigt : attendre l'écriture puis
   * le rechargement de la liste laissait deux secondes d'interrupteur figé sur
   * l'ancienne position, pendant lesquelles le geste semblait n'avoir servi à
   * rien. On écrit donc dans le cache d'abord — la colonne et ce volet lisent la
   * même entrée, tout bouge dans le même rendu —, on envoie ensuite, et on
   * REMET l'instantané d'avant si le serveur refuse (403 d'un membre, cadence
   * devenue illisible), avec son message.
   *
   * `next_run_at` suit dans le même mouvement : le désactiver désarme
   * l'échéance, le réactiver la recalcule — avec la MÊME fonction que le
   * serveur, sinon la ligne « prochaine exécution » afficherait une date pour en
   * montrer une autre une seconde plus tard.
   */
  const toggleSeq = useRef(0);
  const toggleEnabled = (enabled: boolean) => {
    const seq = ++toggleSeq.current;
    const previous = patchRoutineInCache(queryClient, routine.id, {
      enabled,
      next_run_at: optimisticNextRunAt(routine, enabled),
    });
    void updateRoutineApi(routine.id, { enabled })
      .then(({ routine: saved }) => {
        // Une bascule plus récente est partie entre-temps : sa réponse fait foi,
        // pas celle-ci — deux clics rapides ne doivent pas finir à l'envers.
        if (seq === toggleSeq.current) patchRoutineInCache(queryClient, saved.id, saved);
      })
      .catch((err) => {
        if (seq !== toggleSeq.current) return;
        if (previous) queryClient.setQueryData(routinesQueryKey(), previous);
        toast.error((err as Error).message);
      });
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
          projectId={project?.id ?? null}
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
                  seed={projectOrbSeed(project)}
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
            seed={projectOrbSeed(project)}
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

        {/* PENDANT L'ÉDITION, « Annuler / Enregistrer » PRENNENT LA PLACE de
            l'interrupteur et du menu — ils ne s'y ajoutent pas.
            Ce n'est pas qu'une question de place : un interrupteur qui écrit
            immédiatement, à côté d'un formulaire qui attend d'être enregistré,
            ce sont deux notions d'« appliqué » sur la même ligne. Et « Lancer
            maintenant » lancerait la routine telle qu'elle est ENREGISTRÉE,
            c'est-à-dire pas celle qu'on est en train d'écrire. */}
        {!isOwner ? null : editing ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => void saveDraft()}
              disabled={busy || !draft?.prompt.trim()}
            >
              {tCommon("save")}
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {/* L'interrupteur reste DEHORS : c'est l'état de la routine — elle
                tourne, ou elle est en pause —, pas un geste ponctuel qu'on va
                chercher dans un menu. */}
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {t("enabledLabel")}
              {/* Pas de `disabled` pendant sa propre écriture : elle est
                  optimiste, il n'y a rien à attendre. `busy` ne le grise que
                  pour les autres gestes (un lancement, une suppression en
                  cours), où l'état pourrait changer sous la main. */}
              <Switch
                checked={routine.enabled}
                disabled={busy}
                onCheckedChange={toggleEnabled}
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
                <DropdownMenuItem onSelect={() => setDraft(draftFrom(routine))}>
                  <Pencil className="size-4" />
                  {tCommon("edit")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-4" />
                  {tCommon("moveToTrash")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {editing && draft ? (
        <RoutineEditor
          draft={draft}
          onChange={setDraft}
          projectId={routine.project_id}
          busy={busy}
        />
      ) : (
        <>
          {/* ── La cadence, puis CE QU'ELLE FAIT ────────────────────────
              L'instruction sous la cadence : sans elle, une routine n'était
              qu'un titre de trois mots et une heure, tout tassé en haut de
              l'écran — et « ce qu'elle fait » était précisément ce qu'on venait
              vérifier. */}
          <div className="flex shrink-0 flex-col gap-1 px-4 pb-2">
            <RoutineSummary
              schedule={routineSchedule(routine)}
              model={routine.model}
            />

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

            {/* L'instruction, rendue et repliée (cf. `RoutinePrompt`). */}
            <RoutinePrompt prompt={routine.prompt} />
          </div>
        </>
      )}

      {/* ── Exécutions : UNE LIGNE par passage ─────────────────────────
          Pleine largeur, sa date et l'état de sa pull request. Pas le fil :
          empiler des conversations dans une liste rend les deux illisibles.
          Ouvrir une ligne ouvre le fil, à sa place.

          En TÊTE, le passage à VENIR — la même liste, un cran plus tôt dans le
          temps. Grisé et sans chevron : il n'a rien produit, il n'y a rien à
          ouvrir. Il ne paraît que si la routine est armée : une routine en
          pause n'a pas de prochain passage, et en annoncer un serait faux.

          Absentes pendant l'ÉDITION : on règle la routine ou on lit ce qu'elle
          a produit, jamais les deux en même temps — et le formulaire a besoin
          de toute la hauteur pour ne pas se lire au défilement. */}
      {editing ? null : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-2 pb-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t("runs")}
            </h3>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2 px-4 py-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : (
            <div
              ref={listFade.ref}
              {...listFade.scrollProps}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {/* Rien à encadrer quand il n'y a ni passage à venir ni passage
                  passé : la liste disparaît entièrement plutôt que de laisser
                  son filet du haut tout seul au-dessus de l'écran vide. */}
              {nextRunAtIso || runs.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border border-t border-border">
                  {nextRunAtIso ? <NextRunRow at={nextRunAtIso} /> : null}
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
              ) : null}

              {/* Le geste EST là où le vide se constate : « elle n'a pas encore
                  tourné » appelle « alors fais-la tourner », pas un détour par
                  le menu. Réservé au propriétaire, comme le reste. Il reste
                  sous la ligne du prochain passage quand elle est là : les deux
                  disent des choses différentes — ce qui n'a pas eu lieu, et ce
                  qu'on peut faire tout de suite sans attendre. */}
              {runs.length === 0 ? (
                <div className="px-4 py-8">
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
              ) : null}
            </div>
          )}
        </div>
      )}

      <ConfirmDeleteDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("deleteTitle", { title: routine.title })}
        description={t("deleteDescription")}
        confirmLabel={tCommon("moveToTrash")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/**
 * L'INSTRUCTION de la routine : rendue en markdown, repliée, et dépliable.
 *
 * Elle EST du markdown à la source — titres, listes, chemins de fichiers en
 * `code` — et l'afficher brut faisait lire des `##` et des `**` à la place de
 * la structure qu'ils portent. Elle fait aussi couramment plusieurs milliers de
 * signes : c'est un cahier des charges, pas une phrase. D'où deux décisions qui
 * vont ensemble :
 *
 *  - **repliée par défaut.** On ouvre une routine pour voir ce qu'elle a
 *    produit ; dépliée d'office, l'instruction pousserait la liste des
 *    exécutions hors de l'écran, à chaque fois, pour un texte qu'on a écrit
 *    soi-même.
 *  - **`line-clamp` ne peut plus servir.** Il compte des lignes DANS un bloc, et
 *    un rendu markdown en produit plusieurs (titres, paragraphes, listes) : il
 *    ne couperait plus rien. C'est donc une HAUTEUR qui borne, et le fondu de
 *    `useScrollFade` qui dit que le texte continue — sur une boîte qui clippe,
 *    son `edges.end` est exactement ce signal-là, déjà mesuré, déjà amorti.
 *
 * Dépliée, elle ne pousse toujours rien : elle défile DANS sa boîte, et la
 * liste des exécutions reste à l'écran sous elle.
 */
function RoutinePrompt({ prompt }: { prompt: string }) {
  const t = useTranslations("Routines");
  const [expanded, setExpanded] = useState(false);
  /* Un fondu plus long que celui d'un bord de défilement (2 rem par défaut) :
     ici il ne signale pas une lisière, il éteint une fin de texte coupée. */
  const fade = useScrollFade<HTMLDivElement>("y", "3rem");
  /**
   * « Voir plus » n'existe que s'il y a vraiment plus à voir : une instruction
   * de deux lignes ne porte pas un bouton qui ne révélerait rien.
   *
   * Le constat se FIGE une fois relevé. Déplié, `edges.end` répond à une autre
   * question — « reste-t-il à défiler ? » — et retombe à faux dès qu'on touche
   * le bas : le bouton du retour disparaîtrait sous le doigt, au moment précis
   * où l'on veut replier.
   */
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    if (!expanded && fade.edges.end) setTruncated(true);
  }, [expanded, fade.edges.end]);

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      <div
        ref={fade.ref}
        {...fade.scrollProps}
        className={cn(
          "w-full",
          // Replié : la hauteur des six lignes que `line-clamp-6` donnait.
          expanded ? "max-h-[40vh] overflow-y-auto" : "max-h-36 overflow-hidden",
        )}
      >
        <Markdown className="text-muted-foreground">{prompt}</Markdown>
      </div>
      {truncated ? (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? t("promptShowLess") : t("promptShowMore")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Le passage à VENIR, en tête de la liste des exécutions. Tout est en
 * `text-muted-foreground` : c'est ce qui le distingue d'un passage qui a eu
 * lieu, sans lui donner ni icône ni badge à part. Aucun geste — la ligne n'est
 * pas cliquable, il n'y a encore rien à lire.
 *
 * **Il se dit en RELATIF** — « aujourd'hui à 09:00 », « dans 3 jours à 11:00 ».
 * C'est la question qu'on se pose en le lisant : pas *quand* dans l'absolu,
 * mais *dans combien de temps*. La date exacte n'a pas disparu, elle est passée
 * derrière, au survol, dans l'infobulle.
 *
 * Le déclencheur de l'infobulle, c'est le TEXTE — pas la ligne. D'où l'absence
 * de `flex-1` sur le `span` : étiré, il ferait de toute la largeur une zone de
 * survol, et l'infobulle sortirait en passant à côté de ce qu'elle explique.
 *
 * L'écart se compte en jours CALENDAIRES et non en durée : à 22 h, un passage
 * demain à 9 h est « demain », pas « dans 11 heures ». Ce qui change d'un
 * passage à l'autre, c'est le nom du jour, pas un nombre d'heures.
 *
 * `useNow` vit ICI plutôt que dans le volet : une horloge qui bat à la minute
 * ne doit re-rendre que la ligne qui la lit.
 *
 * Un passage en retard d'un jour PLEIN — le cron est mort — retombe sur la date
 * absolue : « aujourd'hui » y serait faux, et un retard pareil doit se voir.
 */
function NextRunRow({ at }: { at: string }) {
  const t = useTranslations("Routines");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  const date = new Date(at);
  const exact = format.dateTime(date, { dateStyle: "full", timeStyle: "short" });
  const time = format.dateTime(date, { hour: "2-digit", minute: "2-digit" });
  const days = calendarDaysBetween(now, date);

  const label =
    days < 0
      ? t("nextRunAt", {
          date: format.dateTime(date, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })
      : days === 0
        ? t("nextRunToday", { time })
        : days === 1
          ? t("nextRunTomorrow", { time })
          : t("nextRunInDays", { days, time });

  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="min-w-0 truncate">{label}</span>
        </TooltipTrigger>
        <TooltipContent>{exact}</TooltipContent>
      </Tooltip>
    </li>
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

/**
 * L'échéance que le serveur VA écrire, calculée ici pour ne pas l'attendre :
 * `null` quand on met la routine en pause (l'échéance est désarmée), la
 * prochaine occurrence quand on la réveille. C'est `updateRoutine` qui fait
 * foi, mais il fait exactement ce calcul-là, avec cette fonction-là.
 *
 * Une cadence que `nextRunAt` refuse (fuseau retiré d'ICU, donnée bricolée) ne
 * se devine pas : on garde la valeur en place et on laisse la réponse trancher.
 */
function optimisticNextRunAt(routine: Routine, enabled: boolean): string | null {
  if (!enabled) return null;
  try {
    return nextRunAt(routineSchedule(routine), new Date()).toISOString();
  } catch {
    return routine.next_run_at;
  }
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
 * COMMENT la routine est réglée, en une ligne : sa cadence, et le modèle qui
 * l'exécute. Les deux réglages qui décident de ce que coûte et de ce que vaut
 * chaque exécution, ensemble parce qu'ils répondent à la même question.
 *
 * La date du prochain passage, elle, n'est pas ici : elle vit dans la liste des
 * exécutions, à sa place chronologique. Les trois tenaient sur cette ligne, et
 * « Tous les jours à 18 h · prochaine exécution 7 août » se lisait comme une
 * seule information alors que c'en est deux — une règle, et une date qui la
 * suit.
 *
 * En LECTURE il décrit la routine enregistrée, sous l'en-tête. En ÉDITION il
 * décrit le BROUILLON, sous les champs qui le fabriquent : c'est la phrase que
 * les réglages produisent, et la lire juste en dessous d'eux évite d'avoir à
 * traduire « lundi, 9, 0, Europe/Paris » de tête. Un modèle FIGÉ sur la routine
 * ne suit pas le défaut du compte, et c'est bien pour ça qu'il se lit plutôt
 * que de se deviner ; sans modèle explicite, le badge le dit au lieu de
 * disparaître — « lequel tourne ? » se pose surtout dans ce cas-là.
 */
function RoutineSummary({
  schedule,
  model,
}: {
  schedule: RoutineSchedule;
  model: string | null;
}) {
  const t = useTranslations("Routines");
  const locale = useLocale();

  // Une cadence en cours d'édition peut être momentanément invalide (aucun jour
  // coché) : `describeSchedule` lève, et une ligne de résumé n'est pas l'endroit
  // où le dire — les champs, eux, le signalent déjà.
  let cadence: string | null = null;
  try {
    cadence = describeSchedule(schedule, (key, values) => t(key, values), {
      locale,
      weekdayLabel: (d) => weekdayName(d, locale),
    });
  } catch {
    cadence = null;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {cadence ? <p className="text-xs text-muted-foreground">{cadence}</p> : null}
      <ModelBadge
        model={model}
        size={12}
        fallbackLabel={t("modelDefaultBadge")}
        tooltip={t("modelTooltip")}
      />
    </div>
  );
}

/** Le brouillon d'édition : tout ce qu'une routine expose au réglage. */
interface RoutineDraft {
  prompt: string;
  /** "" = le modèle par défaut du compte (pas de modèle figé sur la routine). */
  model: string;
  reasoning: ReasoningLevel;
  /** "" = la branche par défaut du dépôt. */
  baseBranch: string;
  /** Part du budget mensuel qu'UN passage peut dépenser (1–100). */
  spendCap: number;
  schedule: RoutineSchedule;
}

/** Le brouillon tel qu'une routine enregistrée le donne. */
function draftFrom(routine: Routine): RoutineDraft {
  return {
    prompt: routine.prompt,
    model: routine.model ?? "",
    reasoning: routine.reasoning_level,
    baseBranch: routine.base_branch ?? "",
    // Les routines posées avant le plafond n'en portent pas dans le cache déjà
    // chargé : le défaut, celui-là même que la base leur a donné.
    spendCap: routine.max_spend_percent ?? DEFAULT_MAX_SPEND_PERCENT,
    schedule: routineSchedule(routine),
  };
}

/**
 * L'édition d'une routine : tout ce qui décide de ce qu'elle fait, et de ce que
 * ça coûte — son instruction, son modèle, son niveau de raisonnement, sa
 * branche de départ et sa cadence.
 *
 * Pas de champ « nom » : le titre est écrit par minddy à partir de
 * l'instruction, et réécrit dès qu'elle change. Pas de wizard rejoué non plus —
 * on ne repasse pas par quatre écrans pour déplacer une heure.
 *
 * Pas de boutons non plus : « Annuler » et « Enregistrer » sont dans l'en-tête,
 * à la place de l'interrupteur, où ils restent visibles quelle que soit la
 * longueur de l'instruction. Ce formulaire ne fait que tenir des champs, et
 * c'est le volet qui possède le brouillon.
 */
function RoutineEditor({
  draft,
  onChange,
  projectId,
  busy,
}: {
  draft: RoutineDraft;
  onChange: (draft: RoutineDraft) => void;
  /** Ancrage du listing de branches : une routine clone le dépôt du projet. */
  projectId: string;
  busy: boolean;
}) {
  const t = useTranslations("Routines");
  const tAgent = useTranslations("Agent");
  const tCommon = useTranslations("Common");
  // Le défaut du COMPTE, puis celui de l'instance : ce que la routine exécutera
  // si on ne lui fige aucun modèle. Le combobox l'affiche comme option « défaut ».
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel } = useAgentPreferencesQuery();
  // Les paliers du modèle que cette routine fait tourner (cf. le composer).
  const reasoningLevels = useReasoningLevelsFor(
    draft.model || defaultModel || providerDefaultModel,
  );

  const set = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    /**
     * Le formulaire DÉFILE, et c'est la seule façon d'atteindre son bas.
     *
     * Il était `shrink-0` dans un parent `overflow-hidden` : une instruction
     * longue poussait tout ce qui la suivait hors de l'écran, sans aucun moyen
     * de le rattraper. `flex-1` + `min-h-0` lui donne la place restante, et
     * `overflow-y-auto` la rend parcourable.
     */
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-3">
      {/* CE QU'ELLE FAIT — en tête, parce que c'est la routine : le reste ne
          fait que dire avec quoi et quand. */}
      <EditorSection title={t("promptLabel")}>
        {/* Le MÊME champ que l'étape `job` du wizard — c'est littéralement le
            même composant : dictée, plafond de saisie et hauteur bornée. */}
        <RoutinePromptField
          autoFocus
          value={draft.prompt}
          onChange={(value) => set("prompt", value)}
          disabled={busy}
        />
      </EditorSection>

      {/* AVEC QUOI elle travaille : le modèle, ce qu'on lui laisse réfléchir, et
          le code dont elle part. Les trois étaient figés à la création sans
          aucune surface pour changer d'avis — il fallait supprimer la routine et
          la refaire.

          En RANGÉES (libellé à gauche, contrôle à droite) et non empilés : trois
          contrôles à la suite sans libellé de ligne ne disaient pas lequel
          réglait quoi, et le sélecteur de modèle en pleine largeur écrasait les
          deux autres alors qu'il n'est pas plus important. Les trois portent
          maintenant la même pastille compacte. */}
      <EditorSection title={t("sectionAgent")}>
        <div className="divide-y divide-border/60">
          <SettingsRow
            label={t("modelLabel")}
            control={
              <ModelCombobox
                variant="compact"
                value={draft.model}
                onChange={(value) => set("model", value)}
                defaultLabel={t("modelDefault")}
                defaultModelId={defaultModel || providerDefaultModel}
                placeholder={t("modelPlaceholder")}
                emptyLabel={t("modelEmpty")}
                loadingLabel={tCommon("loading")}
                freeTextLabel={(query) => t("modelFreeText", { model: query })}
              />
            }
          />
          <SettingsRow
            label={t("reasoningLabel")}
            control={
              <ReasoningCombobox
                value={nearestReasoningLevel(draft.reasoning, reasoningLevels)}
                onChange={(value) => set("reasoning", value)}
                levels={reasoningLevels}
              />
            }
          />
          {/* La branche de DÉPART : celle que chaque exécution clone et depuis
              laquelle elle ouvre sa pull request. Ancrée au projet, comme le
              compose d'une session de carnet — une routine n'a pas de ticket. */}
          <SettingsRow
            label={t("baseBranchLabel")}
            control={
              <BranchCombobox
                projectId={projectId}
                value={draft.baseBranch}
                onChange={(value) => set("baseBranch", value)}
                defaultLabel={tAgent("branchDefault")}
                defaultHint={tAgent("branchDefaultHint")}
                placeholder={tAgent("branchSearchPlaceholder")}
                emptyLabel={tAgent("branchSearchEmpty")}
                loadingLabel={tAgent("branchSearchLoading")}
                disabled={busy}
              />
            }
          />
          {/* CE QU'UN PASSAGE PEUT DÉPENSER. C'est ici qu'on vient le baisser
              après avoir vu ce que la routine coûte vraiment — d'où sa place à
              côté du modèle, l'autre réglage qui décide de la note. */}
          <SettingsRow
            label={t("spendCapLabel")}
            help={t("spendCapHelp")}
            control={
              <SpendCapCombobox
                value={draft.spendCap}
                onChange={(value) => set("spendCap", value)}
                disabled={busy}
              />
            }
          />
        </div>
      </EditorSection>

      {/* QUAND elle part. */}
      <EditorSection title={t("sectionSchedule")}>
        <RoutineScheduleFields
          value={draft.schedule}
          onChange={(value) => set("schedule", value)}
        />
        {/* Ce que tous les champs ci-dessus donnent, en clair. Sous eux, et non
            en bas de l'écran : c'est leur résultat qui se relit avant
            d'enregistrer. */}
        <RoutineSummary schedule={draft.schedule} model={draft.model || null} />
      </EditorSection>
    </div>
  );
}

/**
 * Une section du formulaire : un titre, et ce qu'il coiffe.
 *
 * Le titre reprend celui des « Exécutions » du mode lecture (`text-xs`,
 * `font-medium`, atténué) — c'est déjà le niveau « section » de ce volet, et en
 * inventer un deuxième aurait donné deux hiérarchies dans le même panneau.
 */
function EditorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
