"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Input, Textarea, cn, toast } from "mangue-ui";
import { CalendarDays, CalendarRange, Play, Sun } from "lucide-react";

import { DictateButton } from "@/components/ai-elements/dictate-button";
import { ProjectOrb } from "@/components/project-orb";
import { ModelCombobox } from "@/components/agent/model-combobox";
import { ReasoningCombobox } from "@/components/agent/reasoning-combobox";
import { WizardChoiceCard } from "@/components/wizard/wizard-choice-card";
import { WizardDialog, type WizardStep } from "@/components/wizard/wizard-dialog";
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
  type RoutineFrequency,
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

const FREQUENCY_ICONS: Record<RoutineFrequency, typeof Sun> = {
  daily: Sun,
  weekly: CalendarDays,
  monthly: CalendarRange,
};

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
  const [title, setTitle] = useState("");
  const [model, setModel] = useState("");
  const [reasoning, setReasoning] = useState<ReasoningLevel | null>(null);
  const [frequency, setFrequency] = useState<RoutineFrequency>("weekly");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timezone, setTimezone] = useState(() => browserTimezone());
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
    setTitle("");
    setModel("");
    setReasoning(null);
    setFrequency("weekly");
    setHour(9);
    setMinute(0);
    setWeekday(1);
    setDayOfMonth(1);
    setTimezone(browserTimezone());
    setStepIndex(0);
    setError(null);
    setCreated(null);
    setLaunchingNow(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const schedule: RoutineSchedule = {
    frequency,
    hour,
    minute,
    weekday: frequency === "weekly" ? weekday : null,
    dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
    timezone,
  };

  /** La cadence en une phrase + la date du premier passage. Calculée avec la
      MÊME fonction que le serveur : c'est la seule façon de vérifier un fuseau
      avant de le subir. `null` quand le fuseau saisi n'existe pas. */
  const preview = useMemo(() => {
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
          timeZone: timezone,
        }).format(at),
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency, hour, minute, weekday, dayOfMonth, timezone, locale]);

  /** Titre PROPOSÉ : les premiers mots de l'instruction, jusqu'à la première
      ponctuation. Éditable — c'est une proposition, pas une demande. Le vrai
      résumé serait un appel modèle ; le payer pour un champ qu'on relit de toute
      façon ne se justifie pas ici. */
  const suggestTitle = (text: string): string => {
    const first = text.trim().split(/[.\n!?]/)[0]?.trim() ?? "";
    return first.length > 60 ? `${first.slice(0, 57)}…` : first;
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { routine } = await createRoutineApi({
        projectId,
        title: title.trim() || suggestTitle(prompt),
        prompt: prompt.trim(),
        model: model || null,
        reasoningLevel: reasoning ?? defaultReasoningLevel,
        frequency,
        hour,
        minute,
        weekday: frequency === "weekly" ? weekday : null,
        dayOfMonth: frequency === "monthly" ? dayOfMonth : null,
        timezone,
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
          <div className="relative">
            <Textarea
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={() => {
                // Le titre se propose au moment où l'instruction se pose, pas à
                // chaque frappe : sinon il écraserait ce qu'on vient d'y écrire.
                if (!title.trim()) setTitle(suggestTitle(prompt));
              }}
              placeholder={t("promptPlaceholder")}
              aria-label={t("promptLabel")}
              maxLength={20000}
              rows={6}
              className="min-h-36 resize-none pb-12"
            />
            <DictateButton
              floating
              disabled={creating}
              onTranscription={(text) =>
                setPrompt((current) => (current.trim() ? `${current.trim()} ${text}` : text))
              }
            />
          </div>

          {/* Trois instructions pré-écrites : elles remplacent le champ, elles ne
              s'y ajoutent pas — on choisit un point de départ, on ne colle pas
              trois exemples bout à bout. */}
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  const text = t(key);
                  setPrompt(text);
                  setTitle(suggestTitle(text));
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
              >
                {t(`${key}Label` as "exampleSecurityLabel")}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="routine-title" className="text-xs font-medium text-muted-foreground">
              {t("titleLabel")}
            </label>
            <Input
              id="routine-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              maxLength={120}
            />
          </div>
        </div>
      ),
    },

    model: {
      id: "model",
      title: t("stepModelTitle"),
      subtitle: t("stepModelDesc"),
      content: (
        <div className="flex flex-col gap-4">
          <ModelCombobox
            value={model}
            onChange={setModel}
            defaultLabel={t("modelDefault")}
            defaultModelId={defaultModel || providerDefaultModel}
            placeholder={t("modelPlaceholder")}
            emptyLabel={t("modelEmpty")}
            loadingLabel={tCommon("loading")}
            freeTextLabel={(query) => t("modelFreeText", { model: query })}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("reasoningLabel")}</span>
            <ReasoningCombobox
              value={reasoning ?? defaultReasoningLevel}
              onChange={setReasoning}
            />
          </div>
        </div>
      ),
    },

    schedule: {
      id: "schedule",
      title: t("stepScheduleTitle"),
      subtitle: t("stepScheduleDesc"),
      wide: true,
      submitLabel: t("createRoutine"),
      submitDisabled: !preview,
      content: (
        <div className="flex flex-col gap-6">
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
            role="radiogroup"
            aria-label={t("frequencyLabel")}
          >
            {(["daily", "weekly", "monthly"] as const).map((f) => (
              <WizardChoiceCard
                key={f}
                selected={frequency === f}
                icon={FREQUENCY_ICONS[f]}
                label={t(`frequency_${f}` as "frequency_daily")}
                onSelect={() => setFrequency(f)}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {frequency === "weekly" && (
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
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
            )}
            {frequency === "monthly" && (
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
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
            )}
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {t("timeLabel")}
              <Input
                type="time"
                value={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":");
                  if (h !== undefined) setHour(Number(h) || 0);
                  if (m !== undefined) setMinute(Number(m) || 0);
                }}
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {t("timezoneLabel")}
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value.trim())}
                placeholder="Europe/Paris"
                className="h-9"
              />
            </label>
          </div>

          {/* Le récapitulatif VIVANT : la phrase et la date que la routine va
              vraiment suivre. C'est la seule façon de vérifier un fuseau avant
              de le subir — et le seul endroit qui attrape un fuseau mal tapé. */}
          {preview ? (
            <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <span className="font-medium">{preview.sentence}</span>
              <span className="text-muted-foreground">
                {" — "}
                {t("firstRunAt", { date: preview.first })}
              </span>
            </p>
          ) : (
            <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {t("error_unknownTimezone")}
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
            {preview ? (
              <span className="text-muted-foreground">
                {preview.sentence} — {t("firstRunAt", { date: preview.first })}
              </span>
            ) : null}
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
