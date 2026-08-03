"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Spinner,
  Switch,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  ArrowLeft,
  ArrowRight,
  FileUp,
  Github,
  Gitlab,
  Info,
  ListTodo,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { isValidKey, normalizeKey, suggestKeyFromName } from "@/lib/project-key";
import {
  bindGitRepoApi,
  fetchAccountGitCandidatesApi,
  startAccountGitConnectApi,
} from "@/lib/git-integration-api";
import { useGitConnectionsQuery } from "@/lib/use-git-connections-query";
import {
  importProjectIconApi,
  uploadProjectIconDataUrlApi,
} from "@/lib/projects-api";
import {
  clearProjectDraft,
  saveProjectDraft,
  type DraftRepo,
  type DraftSeed,
  type ProjectDraft,
  type ProjectOrigin,
} from "@/lib/project-draft";
import { putSeedHandoff } from "@/lib/project-seed-handoff";
import { MAX_IMPORT_CSV_BYTES } from "@/lib/import/types";
import { MAX_BRIEF_CHARS } from "@/lib/seed/types";
import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import { ProviderConnectButtons } from "@/components/git/provider-connect-buttons";
import { SearchSelect } from "@/components/search-select";
import { ProjectOrb } from "@/components/project-orb";
import {
  ProjectIconPicker,
  type ProjectIconChoice,
} from "@/components/project-icon-picker";
import { WizardStepper } from "@/components/wizard-stepper";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";
import type { CandidateRepo } from "@/lib/types";

/**
 * Wizard de création de projet (MIN-62, MIN-171) : D'où part-on ? → Projet →
 * Icône → Dépôt git → Amorce → Finitions.
 * Le layout est celui du wizard AutoKap (project-wizard-dialog.tsx) :
 * grande modale fixe (tokens --spacing-dialog-w/h), colonne centrée max-w-lg,
 * titre + sous-titre + stepper à pilules, corps d'étape animé, CTA pleine
 * largeur « Continuer » (« Terminer » en dernière étape) et retour en lien
 * discret.
 *
 * Le projet n'est créé qu'à la DERNIÈRE étape : tout ce qui précède est un
 * brouillon en mémoire (nom, clé, favicon résolu mais pas stocké, dépôt choisi
 * mais pas lié). Fermer le wizard en route ne laisse donc rien derrière — pas
 * de projet vide à moitié configuré. En contrepartie, chaque étape doit savoir
 * travailler sans projet :
 *  - l'icône ne fait que résoudre le favicon (`/api/account/project-icon`),
 *    l'import réel suit la création ;
 *  - le dépôt se choisit au niveau COMPTE (`/api/account/git-connections`), la
 *    liaison suit la création ;
 *  - l'id du projet est tiré ici, pour que l'orbe montrée dans le wizard soit
 *    bien celle du projet créé.
 *
 * L'installation GitHub / l'OAuth GitLab quittent la page en plein écran : le
 * brouillon est sérialisé avant de partir (lib/project-draft.ts) et le callback
 * revient sur `/home?setup=git`, où `ProjectDraftResume` rouvre le wizard.
 *
 * L'amorce suit la même règle que le reste : l'étape COLLECTE (un brief collé,
 * un CSV déposé), elle n'écrit rien. La passe qui en fait des tickets se joue
 * après la création, sur le board du projet neuf, où `?setup=` la déclenche.
 */

const ALL_STEPS = [
  "origin",
  "project",
  "icon",
  "git",
  "seed",
  "finish",
] as const;
type StepId = (typeof ALL_STEPS)[number];

/**
 * Les étapes du parcours. L'amorce dépend de l'origine — tant qu'elle n'est pas
 * choisie, l'étape n'a pas de contenu et ne compte pas dans le stepper.
 */
function stepsFor(origin: ProjectOrigin | null): StepId[] {
  return origin
    ? ["origin", "project", "icon", "git", "seed", "finish"]
    : ["origin", "project", "icon", "git", "finish"];
}

const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/** Reprise du wizard après le redirect d'un provider git. */
export interface ProjectSetupResumeState {
  draft: ProjectDraft;
  /** Connexion fraîchement créée par le callback — ouvre le sélecteur de dépôt. */
  connectionId: string | null;
}

const PROVIDER_ICON = { github: Github, gitlab: Gitlab } as const;

export function CreateProjectWizard({
  open,
  onOpenChange,
  resume,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nouvel objet à chaque reprise — déclenche l'initialisation à l'étape git. */
  resume: ProjectSetupResumeState | null;
}) {
  const router = useRouter();
  const t = useTranslations("Projects");
  const tSettings = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("Issue");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { projects, createProject, updateProject } = useProjects();
  const { track } = useAnalytics();

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Étape « D'où part-on ? » — la réponse décide de ce que l'étape d'amorce
  // demande, et de rien d'autre : le projet se crée de la même façon des deux
  // côtés.
  const [origin, setOrigin] = useState<ProjectOrigin | null>(null);

  // Étape « Projet ». `draftId` est l'id du futur projet : la graine de l'orbe
  // doit être connue avant la création, sinon l'aperçu ment.
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  // Étape « Icône » : rien n'est stocké tant que le projet n'existe pas — on
  // garde de quoi rejouer le choix à la création (favicon à ré-importer, ou
  // image déjà compressée à envoyer).
  const [icon, setIcon] = useState<ProjectIconChoice>({ kind: "none" });
  const iconPreviewUrl = icon.kind === "none" ? null : icon.previewUrl;

  // Étape « Dépôt git » — tout au niveau compte, aucun projet en jeu.
  const { connections, providers } = useGitConnectionsQuery(open);
  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRepo[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [repo, setRepo] = useState<DraftRepo | null>(null);

  // Étape « Amorce ». Elle collecte, elle n'écrit pas : le brief reste un
  // texte, le CSV reste un `File` en mémoire — aucun appel réseau ici, le
  // projet n'existe pas encore.
  const [brief, setBrief] = useState("");
  const [numo, setNumo] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  // Un CSV ne tient pas dans sessionStorage : le détour par le provider git
  // l'oublie. On le redemande, et on le DIT — sinon la zone de dépôt vide
  // passe pour un bug.
  const [csvLost, setCsvLost] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Étape « Finitions ». Smart Assign est proposé ACTIVÉ : c'est le réglage
  // qu'on veut par défaut sur un projet neuf, et le décocher reste à un clic.
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [smartAssignEnabled, setSmartAssignEnabled] = useState(true);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);

  const steps = useMemo(() => stepsFor(origin), [origin]);
  const step: StepId = steps[Math.min(stepIndex, steps.length - 1)];
  const isLast = stepIndex >= steps.length - 1;

  /** L'amorce telle qu'elle est à cet instant — déduite, jamais stockée deux
   *  fois : c'est ce que le brouillon porte et ce que `finish()` rejoue. */
  const seed: DraftSeed | null = useMemo(() => {
    if (origin === "existing") return csvFile ? { kind: "import" } : null;
    if (numo) return { kind: "numo" };
    return brief.trim() ? { kind: "brief", text: brief.trim() } : null;
  }, [origin, csvFile, numo, brief]);

  // Le plafond de la passe (lib/seed/types.ts) : le refuser ici évite de le
  // découvrir après la création du projet, sur le board.
  const briefTooLong = step === "seed" && brief.length > MAX_BRIEF_CHARS;

  const reset = useCallback(() => {
    setStepIndex(0);
    setSubmitting(false);
    setError(null);
    setDraftId(crypto.randomUUID());
    setOrigin(null);
    setName("");
    setKey("");
    setKeyTouched(false);
    setIcon({ kind: "none" });
    setConnecting(null);
    setActiveConnectionId(null);
    setCandidates(null);
    setRepo(null);
    setBrief("");
    setNumo(false);
    setCsvFile(null);
    setCsvLost(false);
    setFeedbackEnabled(false);
    setSmartAssignEnabled(true);
    setAutoAssignEnabled(false);
  }, []);

  // Reprise après le redirect provider : le brouillon reprend sa place, on
  // repart à l'étape git, sélecteur de dépôt ouvert si la connexion a été créée.
  useEffect(() => {
    if (!resume) return;
    const { draft } = resume;
    setDraftId(draft.id);
    setOrigin(draft.origin);
    setName(draft.name);
    setKey(draft.key);
    setKeyTouched(draft.keyTouched);
    setIcon(draft.icon);
    setRepo(draft.repo);
    setBrief(draft.seed?.kind === "brief" ? draft.seed.text : "");
    setNumo(draft.seed?.kind === "numo");
    // Le CSV n'a pas fait le voyage (voir `DraftSeed`) : la zone de dépôt
    // repart vide, avec la note qui explique pourquoi.
    setCsvFile(null);
    setCsvLost(draft.seed?.kind === "import");
    setFeedbackEnabled(draft.feedbackEnabled);
    setSmartAssignEnabled(draft.smartAssignEnabled);
    setAutoAssignEnabled(draft.autoAssignEnabled);
    setStepIndex(stepsFor(draft.origin).indexOf("git"));
    setActiveConnectionId(resume.connectionId);
  }, [resume]);

  // Entonnoir du wizard (MIN-78) : ouverture, étape vue, abandon. Sans
  // « abandonné », on ne verrait que les projets créés — jamais l'étape qui
  // fait décrocher (la leçon AutoKap : c'était l'étape GitHub obligatoire).
  useTrackView(open, "opened", () =>
    track("project_wizard_opened", { source: resume ? "resume" : "sidebar" })
  );
  // Clé = l'étape : chaque étape atteinte est comptée une fois, revenir en
  // arrière ne la recompte pas (« combien de gens ont atteint l'étape N »).
  useTrackView(open, step, () => track("project_wizard_step_viewed", { step }));

  const handleOpenChange = (next: boolean) => {
    // Fermeture avant la dernière étape = abandon. `finish()` ferme via ce même
    // chemin, mais seulement depuis l'étape finale, qui est exclue ici.
    if (!next && step !== "finish") {
      track("project_wizard_abandoned", { last_step: step });
    }
    if (!next) {
      // Un brouillon abandonné ne doit pas ressurgir à la prochaine ouverture :
      // il n'existe que pour survivre à l'aller-retour chez le provider.
      clearProjectDraft();
      reset();
    }
    onOpenChange(next);
  };

  /** Retour aux étapes déjà validées uniquement (stepper + lien retour). */
  const goToStep = (target: number) => {
    if (submitting) return;
    if (target >= 0 && target < stepIndex) setStepIndex(target);
  };

  // ── Étape « D'où part-on ? » ──────────────────────────────────────────────
  // Un choix binaire qui demande deux gestes est un choix binaire mal posé : la
  // carte cliquée pose la réponse ET avance.
  const chooseOrigin = (next: ProjectOrigin) => {
    setOrigin(next);
    // Changer d'avis ne traîne pas l'amorce de l'autre branche derrière soi.
    if (next !== origin) {
      setBrief("");
      setNumo(false);
      setCsvFile(null);
      setCsvLost(false);
    }
    track("project_wizard_origin_chosen", { origin: next });
    setStepIndex((i) => i + 1);
  };

  // ── Étape « Amorce » ──────────────────────────────────────────────────────
  const handleCsvFile = (file: File) => {
    if (file.size > MAX_IMPORT_CSV_BYTES) {
      toast.error(tSettings("importErrorTooLarge"));
      return;
    }
    setCsvFile(file);
    setCsvLost(false);
  };

  /** Quitter l'étape d'amorce, quel que soit le chemin (« Continuer »,
   *  « Passer », le lien vers Numo) : le choix se compte une fois, là. */
  const leaveSeedStep = (chosen: DraftSeed | null) => {
    track("project_wizard_seed_chosen", { seed: chosen?.kind ?? "none" });
    setStepIndex((i) => i + 1);
  };

  // ── Étape « Projet » ──────────────────────────────────────────────────────
  const handleNameChange = (value: string) => {
    setName(value);
    if (!keyTouched) setKey(suggestKeyFromName(value));
  };

  const submitProjectStep = () => {
    setError(null);
    const finalKey = normalizeKey(key);
    if (!name.trim()) {
      setError(t("nameRequired"));
      return;
    }
    if (!isValidKey(finalKey)) {
      setError(t("keyInvalid"));
      return;
    }
    // La clé est unique par propriétaire : la vérifier ici évite de découvrir le
    // conflit trois étapes plus loin, au moment de créer. Le serveur reste juge
    // (un autre onglet, un autre appareil) — ce n'est qu'un garde-fou avancé.
    if (projects.some((p) => p.owner_id === user?.id && p.key === finalKey)) {
      setError(t("keyTaken", { key: finalKey }));
      return;
    }
    setKey(finalKey);
    setStepIndex((i) => i + 1);
  };

  // ── Étape « Dépôt git » ───────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConnectionId) {
      setCandidates(null);
      return;
    }
    let cancelled = false;
    setCandidatesLoading(true);
    setCandidates(null);
    fetchAccountGitCandidatesApi(activeConnectionId)
      .then((res) => {
        if (!cancelled) setCandidates(res.candidates);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error((err as Error).message);
          setActiveConnectionId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeConnectionId]);

  /** L'état complet du wizard, tel qu'il doit survivre à un redirect provider. */
  const snapshot = () => ({
    id: draftId,
    origin,
    name,
    key,
    keyTouched,
    icon,
    seed,
    repo,
    feedbackEnabled,
    smartAssignEnabled,
    autoAssignEnabled,
  });

  const handleConnect = async (provider: RepoProviderId) => {
    setConnecting(provider);
    track("git_connection_started", { provider });
    try {
      const res = await startAccountGitConnectApi(provider);
      if (res.mode === "reuse") {
        setActiveConnectionId(res.connectionId);
      } else {
        // On quitte l'app : le brouillon part en session, le callback revient
        // sur /home?setup=git et ProjectDraftResume rouvre le wizard ici.
        saveProjectDraft(snapshot());
        window.location.href = res.url;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConnecting(null);
    }
  };

  const handlePickRepo = (externalRepoId: string) => {
    const candidate = (candidates ?? []).find(
      (c) => c.external_repo_id === externalRepoId
    );
    const connection = connections.find((c) => c.id === activeConnectionId);
    if (!candidate || !connection) return;
    // Choisi, pas encore lié : la liaison a besoin d'un projet, elle attend la
    // création.
    setRepo({
      connectionId: connection.id,
      provider: connection.provider,
      externalRepoId: candidate.external_repo_id,
      fullName: candidate.full_name,
    });
    setActiveConnectionId(null);
  };

  // ── Création (dernière étape) ─────────────────────────────────────────────
  const finish = async () => {
    setSubmitting(true);
    setError(null);

    let created;
    try {
      created = await createProject({ id: draftId, name: name.trim(), key });
    } catch (err) {
      // Nom, clé déjà prise, limite de plan : tout se règle à la première étape,
      // et le brouillon reste intact — on n'a rien perdu.
      setStepIndex(0);
      setError((err as Error).message);
      setSubmitting(false);
      return;
    }

    clearProjectDraft();
    track("project_created", {
      has_icon: icon.kind !== "none",
      has_git_link: !!repo,
    });

    // À partir d'ici le projet EXISTE : chacune des finitions peut échouer sans
    // remettre la création en cause. On le dit, on continue, on n'annule rien.
    const enrich = async (label: string, run: () => Promise<unknown>) => {
      try {
        await run();
        return true;
      } catch (err) {
        console.error(`[create-project-wizard] ${label} failed:`, err);
        toast.error((err as Error).message);
        return false;
      }
    };

    if (icon.kind === "site") {
      await enrich("icon", () => importProjectIconApi(created.id, icon.siteUrl));
    } else if (icon.kind === "file") {
      // L'aperçu est l'image compressée elle-même : la poser sur le projet ne
      // demande rien de plus que de la renvoyer telle quelle.
      await enrich("icon", () =>
        uploadProjectIconDataUrlApi(created.id, icon.previewUrl)
      );
    }
    if (repo) {
      const linked = await enrich("git bind", () =>
        bindGitRepoApi(created.id, repo.connectionId, repo.externalRepoId)
      );
      if (linked) track("project_git_linked", { provider: repo.provider });
    }
    if (smartAssignEnabled || autoAssignEnabled) {
      await enrich("assign settings", () =>
        updateProject(created.id, {
          smart_assign_enabled: smartAssignEnabled,
          auto_assign_enabled: autoAssignEnabled,
        })
      );
    }
    if (feedbackEnabled) {
      await enrich("feedback board", async () => {
        const response = await fetch(
          `/api/projects/${created.id}/feedback/settings`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          }
        );
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "Error");
        }
        void queryClient.invalidateQueries({
          queryKey: ["feedback-settings", created.id],
        });
      });
    }

    // L'icône et les réglages sont posés après la création : la liste en cache
    // date déjà d'avant.
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    track("project_wizard_completed", {
      has_git_link: !!repo,
      feedback_enabled: feedbackEnabled,
      smart_assign_enabled: smartAssignEnabled,
      auto_assign_enabled: autoAssignEnabled,
    });
    toast.success(t("wizardDoneToast", { name: created.name }));
    setSubmitting(false);
    handleOpenChange(false);

    // L'amorce se joue sur le board du projet neuf : c'est le trou qu'on est en
    // train de combler, et la passe est trop longue pour une étape de wizard
    // (MIN-170). Ce qui a été saisi voyage en mémoire, l'URL ne porte que
    // l'instruction. « J'en parle avec Numo » n'a pas encore sa surface
    // (MIN-173) : le choix est compté, l'atterrissage reste le board.
    if (seed?.kind === "brief") {
      putSeedHandoff({ kind: "brief", text: seed.text });
      router.push(`/projects/${created.id}?setup=brief`);
    } else if (seed?.kind === "import" && csvFile) {
      putSeedHandoff({ kind: "import", file: csvFile });
      router.push(`/projects/${created.id}?setup=import`);
    } else {
      router.push(`/projects/${created.id}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "project") submitProjectStep();
    else if (step === "seed") leaveSeedStep(seed);
    else if (step === "finish") void finish();
    else setStepIndex((i) => i + 1);
  };

  const stepTitle: Record<StepId, string> = {
    origin: t("wizardOriginTitle"),
    project: t("newProject"),
    icon: t("wizardIconTitle"),
    git: t("wizardGitTitle"),
    seed:
      origin === "existing" ? t("wizardSeedImportTitle") : t("wizardSeedBriefTitle"),
    finish: t("wizardFinishTitle"),
  };
  const stepSubtitle: Record<StepId, string> = {
    origin: t("wizardOriginDesc"),
    project: t("dialogDescription", {
      entityPlural: tIssue("entityPlural").toLowerCase(),
    }),
    icon: t("wizardIconDesc"),
    git: t("wizardGitDesc"),
    seed:
      origin === "existing"
        ? t("wizardSeedImportDesc")
        : t("wizardSeedBriefDesc", {
            entityPlural: tIssue("entityPlural").toLowerCase(),
          }),
    finish: t("wizardFinishSubtitle"),
  };

  const configuredProviderIds = providers.filter((p) => p.configured).map((p) => p.id);
  const RepoIcon = repo ? PROVIDER_ICON[repo.provider] : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 !rounded-2xl sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]"
      >
        <DialogTitle className="sr-only">{t("newProject")}</DialogTitle>
        <DialogDescription className="sr-only">{stepSubtitle[step]}</DialogDescription>

        <div className="absolute top-4 right-4 z-30">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleOpenChange(false)}
            aria-label={tCommon("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-12">
          <form
            onSubmit={handleSubmit}
            className="flex w-full max-w-lg flex-col items-center gap-7"
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold tracking-tight">
                  {stepTitle[step]}
                </h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {stepSubtitle[step]}
                </p>
              </div>
              <WizardStepper
                currentStep={stepIndex + 1}
                totalSteps={steps.length}
                onStepClick={(s) => goToStep(s - 1)}
                getStepLabel={(s) => stepTitle[steps[s - 1]]}
              />
            </div>

            <div className="w-full overflow-hidden p-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={MOTION}
                  className="w-full"
                >
                  {step === "origin" && (
                    <div className="flex flex-col gap-3">
                      {(
                        [
                          {
                            id: "new",
                            Icon: Sparkles,
                            label: t("wizardOriginNewLabel"),
                            desc: t("wizardOriginNewDesc"),
                          },
                          {
                            id: "existing",
                            Icon: ListTodo,
                            label: t("wizardOriginExistingLabel"),
                            desc: t("wizardOriginExistingDesc"),
                          },
                        ] as const
                      ).map(({ id, Icon, label, desc }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => chooseOrigin(id)}
                          aria-pressed={origin === id}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
                            origin === id
                              ? "border-brand/50 bg-brand/5"
                              : "border-border hover:border-ring/60 hover:bg-accent/40"
                          )}
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                            <Icon className="size-5" strokeWidth={1.5} />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium">{label}</span>
                            <span className="text-xs leading-relaxed text-muted-foreground">
                              {desc}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {step === "project" && (
                    <div className="flex items-end gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <label
                          htmlFor="project-name"
                          className="text-sm font-medium"
                        >
                          {t("nameLabel")}
                        </label>
                        <Input
                          id="project-name"
                          autoFocus
                          required
                          value={name}
                          onChange={(e) => handleNameChange(e.target.value)}
                          placeholder={t("namePlaceholder")}
                        />
                      </div>
                      <div className="flex w-28 shrink-0 flex-col gap-1.5">
                        {/* La clé demande une explication, pas un hint permanent
                            sous le champ : elle tient dans un tooltip au survol
                            du « i », et le sous-titre de l'étape parle du
                            projet. */}
                        <div className="flex items-center gap-1">
                          <label
                            htmlFor="project-key"
                            className="text-sm font-medium"
                          >
                            {t("keyLabel")}
                          </label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                aria-label={t("keyTooltipLabel")}
                                className="flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
                              >
                                <Info className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-left">
                              {t("keyTooltip", {
                                entityPlural: tIssue("entityPlural").toLowerCase(),
                                key: key || "MIND",
                              })}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Input
                          id="project-key"
                          required
                          value={key}
                          onChange={(e) => {
                            setKeyTouched(true);
                            setKey(normalizeKey(e.target.value));
                          }}
                          placeholder="MIND"
                          className="font-mono uppercase tracking-wide"
                          maxLength={5}
                        />
                      </div>
                    </div>
                  )}

                  {step === "icon" && (
                    <ProjectIconPicker
                      centered
                      projectId={null}
                      seed={draftId}
                      iconUrl={iconPreviewUrl}
                      onChanged={setIcon}
                    />
                  )}

                  {step === "git" && (
                    <div className="flex flex-col gap-3">
                      {repo && RepoIcon ? (
                        <>
                          <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                              <RepoIcon className="size-5" strokeWidth={1.5} />
                            </span>
                            <div className="min-w-0 flex-1 text-left">
                              <p className="truncate text-sm font-medium">
                                {repo.fullName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {getRepoProvider(repo.provider).displayName}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="self-center bg-transparent text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                            onClick={() => setRepo(null)}
                          >
                            {tCommon("remove")}
                          </Button>
                        </>
                      ) : activeConnectionId ? (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-sm text-muted-foreground">
                            {tSettings("gitPickRepoDesc")}
                          </p>
                          {candidatesLoading ? (
                            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                              <Spinner /> {tSettings("gitLoadingRepos")}
                            </div>
                          ) : (candidates ?? []).length === 0 ? (
                            <p className="py-2 text-sm text-muted-foreground">
                              {tSettings("gitNoRepos")}
                            </p>
                          ) : (
                            <SearchSelect
                              value={null}
                              onChange={(v) => v && handlePickRepo(v)}
                              options={(candidates ?? []).map((c) => ({
                                value: c.external_repo_id,
                                label: c.full_name,
                              }))}
                              searchPlaceholder={tSettings("gitSearchRepo")}
                              emptyText={tSettings("gitNoRepos")}
                              align="center"
                              trigger={
                                <Button variant="outline" className="justify-center">
                                  {tSettings("gitChooseRepo")}
                                </Button>
                              }
                            />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="bg-transparent text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                            onClick={() => setActiveConnectionId(null)}
                          >
                            {tCommon("back")}
                          </Button>
                        </div>
                      ) : configuredProviderIds.length === 0 ? (
                        <p className="py-2 text-center text-sm text-muted-foreground">
                          {tSettings("gitNotConfigured")}
                        </p>
                      ) : (
                        <ProviderConnectButtons
                          onConnect={(provider) => void handleConnect(provider)}
                          connecting={connecting}
                          only={configuredProviderIds}
                        />
                      )}
                    </div>
                  )}

                  {step === "seed" && origin === "new" && (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        autoFocus
                        value={brief}
                        onChange={(e) => {
                          setBrief(e.target.value);
                          // Écrire, c'est reprendre la main : le choix de
                          // passer par Numo ne tient plus.
                          if (numo) setNumo(false);
                        }}
                        placeholder={t("wizardSeedPlaceholder")}
                        aria-label={t("wizardSeedBriefTitle")}
                        rows={8}
                        className="max-h-[40vh] min-h-40 overflow-y-auto"
                      />
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setNumo(true);
                            setBrief("");
                            leaveSeedStep({ kind: "numo" });
                          }}
                          className="text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          {t("wizardSeedNumoLink")}
                        </button>
                        {/* Le compteur n'apparaît qu'aux abords du plafond :
                            avant, il n'apprend rien et met une limite sous les
                            yeux de qui ne l'atteindra jamais. */}
                        {brief.length > MAX_BRIEF_CHARS * 0.75 && (
                          <span
                            className={cn(
                              "shrink-0 font-mono text-xs tabular-nums",
                              brief.length > MAX_BRIEF_CHARS
                                ? "text-destructive"
                                : "text-muted-foreground"
                            )}
                          >
                            {t("wizardSeedCounter", {
                              count: brief.length,
                              max: MAX_BRIEF_CHARS,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {step === "seed" && origin === "existing" && (
                    <div className="flex flex-col gap-3">
                      <input
                        ref={csvInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCsvFile(file);
                        }}
                      />
                      {csvFile ? (
                        <>
                          <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                              <FileUp className="size-5" strokeWidth={1.5} />
                            </span>
                            <div className="min-w-0 flex-1 text-left">
                              <p className="truncate text-sm font-medium">
                                {csvFile.name}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {t("wizardSeedFileReady")}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="self-center bg-transparent text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                            onClick={() => {
                              setCsvFile(null);
                              if (csvInputRef.current) csvInputRef.current.value = "";
                            }}
                          >
                            {tCommon("remove")}
                          </Button>
                        </>
                      ) : (
                        <>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => csvInputRef.current?.click()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                csvInputRef.current?.click();
                              }
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setDragOver(true);
                            }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setDragOver(false);
                              const file = e.dataTransfer.files?.[0];
                              if (file) handleCsvFile(file);
                            }}
                            className={cn(
                              "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center outline-none transition-colors",
                              dragOver
                                ? "border-ring bg-accent/40"
                                : "border-border hover:border-ring/60 focus-visible:border-ring"
                            )}
                          >
                            <FileUp
                              className="size-5 text-muted-foreground"
                              aria-hidden
                            />
                            <p className="text-sm font-medium">
                              {tSettings("importDropTitle")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {tSettings("importDropHint")}
                            </p>
                          </div>
                          {csvLost && (
                            <p className="text-center text-xs text-muted-foreground">
                              {t("wizardSeedFileLost")}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {step === "finish" && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
                        {/* Carré arrondi au ratio des cartes projet (≈ 0,28 —
                            11px @ 40px), bordé pour rester lisible quand le
                            favicon importé est rond ou transparent. */}
                        <ProjectOrb
                          seed={draftId}
                          iconUrl={iconPreviewUrl}
                          className="size-10 rounded-[11px] border border-border"
                        />
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{key}</span>
                            {repo ? ` · ${repo.fullName}` : ` · ${t("wizardNoRepo")}`}
                          </p>
                        </div>
                      </div>
                      <label className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
                        <span className="flex min-w-0 flex-col gap-0.5 text-left">
                          <span className="text-sm font-medium">{t("wizardSmartAssignLabel")}</span>
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            {t("wizardSmartAssignDesc")}
                          </span>
                        </span>
                        <Switch checked={smartAssignEnabled} onCheckedChange={setSmartAssignEnabled} />
                      </label>
                      <label className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
                        <span className="flex min-w-0 flex-col gap-0.5 text-left">
                          <span className="text-sm font-medium">{t("wizardAutoAssignLabel")}</span>
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            {t("wizardAutoAssignDesc")}
                          </span>
                        </span>
                        <Switch checked={autoAssignEnabled} onCheckedChange={setAutoAssignEnabled} />
                      </label>
                      <label className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
                        <span className="flex min-w-0 flex-col gap-0.5 text-left">
                          <span className="text-sm font-medium">
                            {t("wizardFeedbackLabel")}
                          </span>
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            {t("wizardFeedbackDesc")}
                          </span>
                        </span>
                        <Switch
                          checked={feedbackEnabled}
                          onCheckedChange={setFeedbackEnabled}
                        />
                      </label>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {(error || briefTooLong) && (
              <p className="text-center text-sm text-destructive" role="alert">
                {error ?? t("wizardSeedTooLong", { max: MAX_BRIEF_CHARS })}
              </p>
            )}

            <div className="flex w-full flex-col items-center gap-3">
              {/* L'étape d'origine n'a pas de CTA : la carte cliquée EST le
                  geste. Un « Continuer » y demanderait un second clic pour
                  confirmer ce qui vient d'être dit. */}
              {step !== "origin" && (
                <Button
                  type="submit"
                  className="h-10 w-full"
                  disabled={submitting || briefTooLong}
                >
                  {submitting && <Spinner />}
                  {isLast
                    ? t("wizardFinish")
                    : step === "seed" && !seed
                      ? t("wizardSeedSkip")
                      : tCommon("continue")}
                  {!submitting && !isLast && <ArrowRight className="ml-1 h-4 w-4" />}
                </Button>
              )}
              {stepIndex > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="bg-transparent text-xs text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-50"
                  onClick={() => goToStep(stepIndex - 1)}
                  disabled={submitting}
                >
                  <ArrowLeft className="size-3.5" />
                  {tCommon("back")}
                </Button>
              )}
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
