"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, cn, toast } from "mangue-ui";
import { Play } from "lucide-react";

import { ProjectOrb } from "@/components/project-orb";
import { BranchCombobox } from "@/components/agent/branch-combobox";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { SettingsRow } from "@/components/settings/settings-ui";
import { WizardDialog, type WizardStep } from "@/components/wizard/wizard-dialog";
import { RoutinePromptField } from "@/components/routines/routine-prompt-field";
import { RoutineScheduleFields } from "@/components/routines/routine-schedule-fields";
import { useProjects } from "@/lib/projects-context";
import { useAuth } from "@/lib/auth-context";
import { useGitLinkedProjectsQuery } from "@/lib/use-project-git-link-query";
import { useAgentModelsQuery } from "@/lib/use-agent-models-query";
import { useAgentPreferencesQuery } from "@/lib/use-agent-preferences-query";
import { createRoutineApi, runRoutineNowApi, type Routine } from "@/lib/routines-api";
import {
  browserTimezone,
  describeSchedule,
  nextRunAt,
  weekdayName,
  type RoutineSchedule,
} from "@/lib/routine-schedule";
import type { ReasoningLevel } from "@/lib/agent-reasoning";

/**
 * Poser une ROUTINE (MIN-185), à la main : où, quoi, avec quel modèle, à quel
 * rythme.
 *
 * **Un wizard, pas un formulaire**, et c'est la seule porte de création
 * manuelle. Une routine se règle en quatre décisions indépendantes dont trois
 * n'ont pas de réponse évidente ; un formulaire à huit champs les poserait les
 * quatre en même temps. Le [shell partagé](components/wizard/wizard-dialog.tsx)
 * fournit la modale, le stepper, l'animation et les boutons — il reste à dire
 * quelles étapes, quand chacune est valide, et ce que la dernière crée.
 *
 * **Rien n'est créé avant la validation de `schedule`** : fermer la fenêtre en
 * route ne laisse pas de routine orpheline à supprimer, même règle que la clé
 * d'intégration. L'échec de création s'affiche sous l'étape (prop `error` du
 * shell) sans quitter l'écran — un modèle passé hors plan, un dépôt délié
 * entre-temps.
 *
 * **Le wizard ne sert PAS à modifier.** Éditer une routine existante se fait
 * dans son détail, champ par champ : un wizard est un parcours d'établissement,
 * et le rejouer pour changer une heure ferait repasser par quatre écrans.
 */

type StepId = "project" | "job" | "model" | "schedule" | "done";

/** Instructions pré-écrites de l'étape `job` — la page blanche est le vrai
    obstacle de cette étape, et ces trois-là décrivent ce qu'une routine fait de
    mieux : revenir sur ce qu'on ne regarde jamais spontanément. */
const EXAMPLE_KEYS = ["exampleSecurity", "exampleDeps", "exampleTests"] as const;

export function CreateRoutineWizard({
  open,
  onOpenChange,
  initialProjectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ouvert depuis l'en-tête d'un projet : ce projet est déjà choisi, et son
   *  étape disparaît du parcours. */
  initialProjectId?: string | null;
  /** La routine créée — l'appelant la sélectionne et rafraîchit sa liste. */
  onCreated: (routine: Routine) => void;
}) {
  const t = useTranslations("Routines");
  const tAgent = useTranslations("Agent");
  const tCommon = useTranslations("Common");
  const locale = useLocale();
  const { user } = useAuth();
  const { projects } = useProjects();
  const { projectIds: gitLinked, loading: gitLoading } = useGitLinkedProjectsQuery();
  const { defaultModel: providerDefaultModel } = useAgentModelsQuery();
  const { defaultModel, defaultReasoningLevel } = useAgentPreferencesQuery();

  /**
   * Les projets ÉLIGIBLES : possédés (seul le propriétaire peut poser une
   * routine — c'est son budget qui part) ET avec un dépôt lié (sans quoi il n'y
   * a rien à cloner). Proposer les autres mènerait droit à un 403 ou à un 409.
   */
  const eligible = useMemo(
    () =>
      projects.filter(
        (p) => p.owner_id === user?.id && gitLinked.has(p.id),
      ),
    [projects, gitLinked, user?.id],
  );

  const [chosenProjectId, setChosenProjectId] = useState(initialProjectId ?? "");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [reasoning, setReasoning] = useState<ReasoningLevel | null>(null);
  /** "" = la branche par défaut du dépôt, ce qui est le cas courant. */
  const [baseBranch, setBaseBranch] = useState("");
  // La cadence tient dans UN état, celui-là même que le calcul et la phrase
  // lisible attendent : rien à recomposer entre l'écran et le serveur.
  const [schedule, setSchedule] = useState<RoutineSchedule>(() => ({
    frequency: "weekly",
    hour: 9,
    minute: 0,
    weekdays: [1],
    daysOfMonth: [],
    timezone: browserTimezone(),
  }));
  const [stepIndex, setStepIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Routine | null>(null);
  const [launchingNow, setLaunchingNow] = useState(false);

  /** « Lancer maintenant » depuis l'écran final : le premier passage sans
      attendre lundi. La fenêtre se ferme derrière — la routine est déjà
      sélectionnée dans la colonne, et son passage s'y affiche en direct. */
  const launchNow = async (routineId: string) => {
    setLaunchingNow(true);
    try {
      await runRoutineNowApi(routineId);
      toast.success(t("runStarted"));
      handleOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLaunchingNow(false);
    }
  };

  /**
   * L'étape `project` disparaît quand il n'y a rien à choisir : un projet
   * pré-choisi (le « + » d'un en-tête de projet) ou un seul candidat. Le projet
   * effectif est donc DÉRIVÉ, jamais recopié dans l'état par un effet : les
   * projets et leurs liens arrivent par react-query, et une valeur recopiée au
   * montage resterait vide pour toujours.
   */
  const skipProject = !!initialProjectId || eligible.length === 1;
  const projectId =
    chosenProjectId || (skipProject ? (initialProjectId ?? eligible[0]?.id ?? "") : "");

  const reset = () => {
    setChosenProjectId(initialProjectId ?? "");
    setPrompt("");
    setModel("");
    setReasoning(null);
    setSchedule({
      frequency: "weekly",
      hour: 9,
      minute: 0,
      weekdays: [1],
      daysOfMonth: [],
      timezone: browserTimezone(),
    });
    setStepIndex(0);
    setError(null);
    setCreated(null);
    setLaunchingNow(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  /** La cadence en une phrase + la date du premier passage. Calculée avec la
      MÊME fonction que le serveur : c'est la seule façon de vérifier un fuseau
      avant de le subir. `null` quand le fuseau saisi n'existe pas. */
  const preview = useMemo<
    { sentence: string; first: string } | { error: string }
  >(() => {
    try {
      const at = nextRunAt(schedule, new Date());
      const sentence = describeSchedule(
        schedule,
        (key, values) => t(key, values),
        { locale, weekdayLabel: (d) => weekdayName(d, locale) },
      );
      return {
        sentence,
        first: new Intl.DateTimeFormat(locale, {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: schedule.timezone,
        }).format(at),
      };
    } catch (err) {
      // Le motif EXACT du refus, pas « fuseau inconnu » pour tout : une cadence
      // hebdomadaire sans jour et un fuseau mal tapé sont deux problèmes
      // différents, et celui qu'on affiche est celui qu'on doit corriger.
      const code = (err as { code?: string }).code;
      return {
        error: code === "unknownTimezone" ? "error_unknownTimezone" : "error_invalidSchedule",
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, locale]);

  /** La cadence tient-elle debout ? (le récapitulatif ne peut alors qu'exister) */
  const scheduleOk = !("error" in preview);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { routine } = await createRoutineApi({
        projectId,
        prompt: prompt.trim(),
        model: model || null,
        reasoningLevel: reasoning ?? defaultReasoningLevel,
        baseBranch: baseBranch || null,
        frequency: schedule.frequency,
        hour: schedule.hour,
        minute: schedule.minute,
        weekdays: schedule.weekdays,
        daysOfMonth: schedule.daysOfMonth,
        timezone: schedule.timezone,
      });
      setCreated(routine);
      onCreated(routine);
      setStepIndex(steps.length - 1);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Un code connu se traduit ; le reste se dit tel quel plutôt que d'être
      // remplacé par une phrase vague.
      setError(
        code && ROUTINE_ERROR_KEYS.has(code)
          ? t(`error_${code}` as "error_ownerOnly")
          : (err as Error).message,
      );
    } finally {
      setCreating(false);
    }
  };

  const stepDefs: Record<StepId, WizardStep<StepId>> = {
    project: {
      id: "project",
      title: t("stepProjectTitle"),
      subtitle: t("stepProjectDesc"),
      // Cliquer un projet EST le geste : un « Continuer » demanderait un second
      // clic pour confirmer ce qui vient d'être dit.
      hideSubmit: eligible.length > 0,
      submitDisabled: !projectId,
      content:
        eligible.length === 0 && !gitLoading ? (
          // Aucun projet éligible : le dire, et renvoyer vers ce qui manque —
          // une liste vide laisserait chercher pourquoi.
          <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {t("noEligibleProject")}
          </p>
        ) : (
          <div className="flex flex-col gap-1" role="radiogroup" aria-label={t("stepProjectTitle")}>
            {eligible.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={projectId === p.id}
                onClick={() => {
                  setChosenProjectId(p.id);
                  setStepIndex((i) => i + 1);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 text-left outline-none transition-colors",
                  projectId === p.id
                    ? "border-brand/50 bg-muted/40"
                    : "border-border hover:border-brand/40 hover:bg-muted/30",
                )}
              >
                <ProjectOrb seed={p.id} iconUrl={p.icon_url} className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
              </button>
            ))}
          </div>
        ),
    },

    job: {
      id: "job",
      title: t("stepJobTitle"),
      subtitle: t("stepJobDesc"),
      submitDisabled: !prompt.trim(),
      content: (
        <div className="flex flex-col gap-4">
          {/* Le MÊME champ que la modification d'une routine (volet de détail) :
              même dictée, même plafond de saisie, même hauteur bornée. */}
          <RoutinePromptField
            autoFocus
            value={prompt}
            onChange={setPrompt}
            disabled={creating}
          />

          {/* Trois instructions pré-écrites : elles remplacent le champ, elles ne
              s'y ajoutent pas — on choisit un point de départ, on ne colle pas
              trois exemples bout à bout. */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPrompt(t(key))}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
              >
                {t(`${key}Label` as "exampleSecurityLabel")}
              </button>
            ))}
          </div>

        </div>
      ),
    },

    model: {
      id: "model",
      title: t("stepModelTitle"),
      subtitle: t("stepModelDesc"),
      content: (
        /* Les trois réglages de l'agent en RANGÉES — mêmes libellés, mêmes
           pastilles et même ordre que l'éditeur du volet de détail : on ne
           réapprend pas l'écran quand on revient changer un réglage. */
        <div className="divide-y divide-border/60">
          <SettingsRow
            label={t("modelLabel")}
            control={
              <ModelCombobox
                variant="compact"
                value={model}
                onChange={setModel}
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
                value={reasoning ?? defaultReasoningLevel}
                onChange={setReasoning}
              />
            }
          />
          {/* La branche de DÉPART se choisit ICI plutôt qu'après coup : une
              routine qui part de la mauvaise base ouvre des pull requests
              inutilisables, et c'est au moment de la poser qu'on sait sur quoi
              elle doit travailler. Le listing est ancré au projet choisi à
              l'étape précédente. */}
          <SettingsRow
            label={t("baseBranchLabel")}
            control={
              <BranchCombobox
                projectId={projectId}
                value={baseBranch}
                onChange={setBaseBranch}
                defaultLabel={tAgent("branchDefault")}
                defaultHint={tAgent("branchDefaultHint")}
                placeholder={tAgent("branchSearchPlaceholder")}
                emptyLabel={tAgent("branchSearchEmpty")}
                loadingLabel={tAgent("branchSearchLoading")}
                disabled={creating}
              />
            }
          />
        </div>
      ),
    },

    schedule: {
      id: "schedule",
      title: t("stepScheduleTitle"),
      subtitle: t("stepScheduleDesc"),
      wide: true,
      submitLabel: t("createRoutine"),
      submitDisabled: !scheduleOk,
      content: (
        <div className="flex flex-col gap-6">
          {/* Les champs de cadence sont les MÊMES que ceux de l'édition d'une
              routine (`RoutineScheduleFields`) : deux formulaires séparés
              auraient fini par accepter deux choses différentes. */}
          <RoutineScheduleFields value={schedule} onChange={setSchedule} />

          {/* Le récapitulatif VIVANT : la phrase et la date que la routine va
              vraiment suivre. C'est la seule façon de vérifier un fuseau avant
              de le subir — et le seul endroit qui attrape un fuseau mal tapé. */}
          {"error" in preview ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {t(preview.error as "error_unknownTimezone")}
            </p>
          ) : (
            <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{preview.sentence}</span>
              <span className="text-muted-foreground">
                {" — "}
                {t("firstRunAt", { date: preview.first })}
              </span>
            </p>
          )}
        </div>
      ),
    },

    done: {
      id: "done",
      title: t("createdTitle"),
      subtitle: t("createdDesc"),
      // La routine EXISTE : un pas en arrière ne la déferait pas.
      lockBack: true,
      // Le CTA mène à la routine — c'est elle qu'on vient de poser, et la
      // fermeture la laisse sélectionnée dans la colonne.
      submitLabel: t("seeRoutine"),
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm">
            <span className="font-medium">{created?.title}</span>
            {"error" in preview ? null : (
              <span className="text-muted-foreground">
                {preview.sentence} — {t("firstRunAt", { date: preview.first })}
              </span>
            )}
          </div>
          {/* La seconde sortie : voir la routine travailler tout de suite,
              sans attendre lundi — et SANS déplacer l'échéance (c'est la route
              « Lancer maintenant » qui le garantit, pas ce bouton). */}
          {created ? (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              disabled={launchingNow}
              onClick={() => void launchNow(created.id)}
            >
              <Play className="size-4" />
              {t("runNow")}
            </Button>
          ) : null}
        </div>
      ),
    },
  };

  const order: StepId[] = [
    ...(skipProject ? [] : (["project"] as const)),
    "job",
    "model",
    "schedule",
    "done",
  ];
  const steps = order.map((id) => stepDefs[id]);

  return (
    <WizardDialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t("newRoutine")}
      steps={steps}
      stepIndex={stepIndex}
      onStepIndexChange={setStepIndex}
      submitting={creating}
      error={error}
      /**
       * Un clic à côté ne doit pas emporter le brouillon. La question n'est
       * posée QU'ENTRE les deux bouts du parcours : sur la première étape il
       * n'y a rien à perdre, et sur `done` la routine existe déjà — fermer y
       * EST la façon de finir. Même règle que le wizard du board public.
       */
      dismissConfirm={
        stepIndex > 0 && order[Math.min(stepIndex, order.length - 1)] !== "done"
          ? {
              title: t("quitTitle"),
              description: t("quitDescription"),
              confirmLabel: t("quitConfirm"),
              cancelLabel: t("quitCancel"),
            }
          : undefined
      }
      onSubmit={(id) => {
        if (id === "done") {
          handleOpenChange(false);
          return;
        }
        if (id === "schedule") {
          if (!projectId) {
            toast.error(t("noEligibleProject"));
            return;
          }
          void create();
          return;
        }
        setStepIndex((i) => i + 1);
      }}
    />
  );
}

/** Les refus que l'écran sait nommer. Le reste s'affiche tel quel. */
const ROUTINE_ERROR_KEYS = new Set([
  "ownerOnly",
  "noRepo",
  "modelAbovePlan",
  "unknownTimezone",
  "invalidSchedule",
  "titleRequired",
  "promptRequired",
]);
