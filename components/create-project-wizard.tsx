"use client";

import { useCallback, useEffect, useState } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "mangue-ui";
import { ArrowLeft, ArrowRight, Github, Gitlab, Info, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { isValidKey, normalizeKey, suggestKeyFromName } from "@/lib/project-key";
import {
  bindGitRepoApi,
  fetchAccountGitCandidatesApi,
  startAccountGitConnectApi,
} from "@/lib/git-integration-api";
import { useGitConnectionsQuery } from "@/lib/use-git-connections-query";
import { importProjectIconApi } from "@/lib/projects-api";
import {
  clearProjectDraft,
  saveProjectDraft,
  type DraftRepo,
  type ProjectDraft,
} from "@/lib/project-draft";
import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import { ProviderConnectButtons } from "@/components/git/provider-connect-buttons";
import { SearchSelect } from "@/components/search-select";
import { ProjectOrb } from "@/components/project-orb";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { WizardStepper } from "@/components/wizard-stepper";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";
import type { CandidateRepo } from "@/lib/types";

/**
 * Wizard de création de projet (MIN-62) : Projet → Icône → Dépôt git →
 * Finitions. Le layout est celui du wizard AutoKap (project-wizard-dialog.tsx) :
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
 */

const STEPS = ["project", "icon", "git", "finish"] as const;
type StepId = (typeof STEPS)[number];

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

  // Étape « Projet ». `draftId` est l'id du futur projet : la graine de l'orbe
  // doit être connue avant la création, sinon l'aperçu ment.
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  // Étape « Icône » : favicon résolu pour l'aperçu, site à ré-importer après.
  const [iconPreviewUrl, setIconPreviewUrl] = useState<string | null>(null);
  const [iconSiteUrl, setIconSiteUrl] = useState<string | null>(null);

  // Étape « Dépôt git » — tout au niveau compte, aucun projet en jeu.
  const { connections, providers } = useGitConnectionsQuery(open);
  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRepo[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [repo, setRepo] = useState<DraftRepo | null>(null);

  // Étape « Finitions ». Smart Assign est proposé ACTIVÉ : c'est le réglage
  // qu'on veut par défaut sur un projet neuf, et le décocher reste à un clic.
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [smartAssignEnabled, setSmartAssignEnabled] = useState(true);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);

  const step: StepId = STEPS[Math.min(stepIndex, STEPS.length - 1)];
  const isLast = stepIndex >= STEPS.length - 1;

  const reset = useCallback(() => {
    setStepIndex(0);
    setSubmitting(false);
    setError(null);
    setDraftId(crypto.randomUUID());
    setName("");
    setKey("");
    setKeyTouched(false);
    setIconPreviewUrl(null);
    setIconSiteUrl(null);
    setConnecting(null);
    setActiveConnectionId(null);
    setCandidates(null);
    setRepo(null);
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
    setName(draft.name);
    setKey(draft.key);
    setKeyTouched(draft.keyTouched);
    setIconPreviewUrl(draft.iconPreviewUrl);
    setIconSiteUrl(draft.iconSiteUrl);
    setRepo(draft.repo);
    setFeedbackEnabled(draft.feedbackEnabled);
    setSmartAssignEnabled(draft.smartAssignEnabled);
    setAutoAssignEnabled(draft.autoAssignEnabled);
    setStepIndex(STEPS.indexOf("git"));
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
    name,
    key,
    keyTouched,
    iconSiteUrl,
    iconPreviewUrl,
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
      has_icon: !!iconSiteUrl,
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

    if (iconSiteUrl) {
      await enrich("icon", () => importProjectIconApi(created.id, iconSiteUrl));
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
    router.push(`/projects/${created.id}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "project") submitProjectStep();
    else if (step === "finish") void finish();
    else setStepIndex((i) => i + 1);
  };

  const stepTitle: Record<StepId, string> = {
    project: t("newProject"),
    icon: t("wizardIconTitle"),
    git: t("wizardGitTitle"),
    finish: t("wizardFinishTitle"),
  };
  const stepSubtitle: Record<StepId, string> = {
    project: t("dialogDescription", {
      entityPlural: tIssue("entityPlural").toLowerCase(),
    }),
    icon: t("wizardIconDesc"),
    git: t("wizardGitDesc"),
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
                totalSteps={STEPS.length}
                onStepClick={(s) => goToStep(s - 1)}
                getStepLabel={(s) => stepTitle[STEPS[s - 1]]}
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
                      onChanged={(previewUrl, site) => {
                        setIconPreviewUrl(previewUrl);
                        setIconSiteUrl(site);
                      }}
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

            {error && (
              <p className="text-center text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex w-full flex-col items-center gap-3">
              <Button type="submit" className="h-10 w-full" disabled={submitting}>
                {submitting && <Spinner />}
                {isLast ? t("wizardFinish") : tCommon("continue")}
                {!submitting && !isLast && <ArrowRight className="ml-1 h-4 w-4" />}
              </Button>
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
