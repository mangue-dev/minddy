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
  toast,
} from "mangue-ui";
import { ArrowLeft, ArrowRight, Github, Gitlab, X } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { isValidKey, normalizeKey, suggestKeyFromName } from "@/lib/project-key";
import {
  bindGitRepoApi,
  fetchGitCandidatesApi,
  startGitConnectApi,
} from "@/lib/git-integration-api";
import {
  projectGitLinkQueryKey,
  useProjectGitLinkQuery,
} from "@/lib/use-project-git-link-query";
import { getRepoProvider, type RepoProviderId } from "@/lib/repo-providers";
import { ProviderConnectButtons } from "@/components/git/provider-connect-buttons";
import { SearchSelect } from "@/components/search-select";
import { ProjectOrb } from "@/components/project-orb";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { WizardStepper } from "@/components/wizard-stepper";
import type { CandidateRepo, Project } from "@/lib/types";

/**
 * Wizard de création de projet (MIN-62) : Projet → Icône → Dépôt git →
 * Finitions. Le layout est celui du wizard AutoKap (project-wizard-dialog.tsx) :
 * grande modale fixe (tokens --spacing-dialog-w/h), colonne centrée max-w-lg,
 * titre + sous-titre + stepper à pilules, corps d'étape animé, CTA pleine
 * largeur « Continuer » (« Terminer » en dernière étape) et retour en lien
 * discret.
 *
 * Contrairement à AutoKap (brouillon + finalize), le projet est créé dès la
 * validation de l'étape 1 : les étapes suivantes enrichissent un projet déjà
 * valide, donc fermer le wizard en cours de route ne laisse rien d'orphelin.
 * C'est aussi ce qui permet à l'étape git de réutiliser les endpoints projet de
 * MIN-47 tels quels — et à l'installation GitHub/GitLab (redirect plein écran)
 * de reprendre le wizard : le callback renvoie vers `/projects/{id}?setup=git`,
 * que le layout projet transforme en `openProjectSetup` (project-setup-resume).
 */

const STEPS = ["project", "icon", "git", "finish"] as const;
type StepId = (typeof STEPS)[number];

const MOTION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };

/** Reprise du wizard sur un projet existant (retour de redirect provider). */
export interface ProjectSetupResumeState {
  project: Project;
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
  const { createProject, updateProject } = useProjects();

  const [stepIndex, setStepIndex] = useState(0);
  const [project, setProject] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Étape « Projet »
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);

  // Étape « Dépôt git »
  const { link, providers } = useProjectGitLinkQuery(open ? project?.id ?? null : null);
  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateRepo[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [binding, setBinding] = useState(false);

  // Étape « Finitions »
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [smartAssignEnabled, setSmartAssignEnabled] = useState(false);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);

  const step: StepId = STEPS[Math.min(stepIndex, STEPS.length - 1)];
  const isLast = stepIndex >= STEPS.length - 1;

  const reset = useCallback(() => {
    setStepIndex(0);
    setProject(null);
    setSubmitting(false);
    setError(null);
    setName("");
    setKey("");
    setKeyTouched(false);
    setConnecting(null);
    setActiveConnectionId(null);
    setCandidates(null);
    setBinding(false);
    setFeedbackEnabled(false);
    setSmartAssignEnabled(false);
    setAutoAssignEnabled(false);
  }, []);

  // Reprise après le redirect provider : projet existant, directement à l'étape
  // git, sélecteur de dépôt ouvert si le callback a transmis la connexion.
  useEffect(() => {
    if (!resume) return;
    setProject(resume.project);
    setName(resume.project.name);
    setKey(resume.project.key);
    setKeyTouched(true);
    setStepIndex(STEPS.indexOf("git"));
    setActiveConnectionId(resume.connectionId);
  }, [resume]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
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

  const submitProjectStep = async () => {
    setError(null);
    const trimmedName = name.trim();
    const finalKey = normalizeKey(key);
    if (!trimmedName) {
      setError(t("nameRequired"));
      return;
    }
    if (!isValidKey(finalKey)) {
      setError(t("keyInvalid"));
      return;
    }

    setSubmitting(true);
    try {
      if (!project) {
        const created = await createProject({ name: trimmedName, key: finalKey });
        setProject(created);
        toast.success(t("projectCreated", { name: created.name }));
        // Le wizard vit hors de l'arbre des pages : la navigation se fait sous
        // la modale, le projet est déjà « chez lui » si le wizard est fermé.
        router.push(`/projects/${created.id}`);
      } else if (trimmedName !== project.name || finalKey !== project.key) {
        const updated = await updateProject(project.id, {
          name: trimmedName,
          key: finalKey,
        });
        setProject(updated);
      }
      setStepIndex((i) => i + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Étape « Dépôt git » ───────────────────────────────────────────────────
  useEffect(() => {
    if (!activeConnectionId || !project) {
      setCandidates(null);
      return;
    }
    let cancelled = false;
    setCandidatesLoading(true);
    setCandidates(null);
    fetchGitCandidatesApi(project.id, activeConnectionId)
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
  }, [activeConnectionId, project]);

  const handleConnect = async (provider: RepoProviderId) => {
    if (!project) return;
    setConnecting(provider);
    try {
      const res = await startGitConnectApi(project.id, provider, "wizard");
      if (res.mode === "reuse") {
        setActiveConnectionId(res.connectionId);
      } else {
        window.location.href = res.url; // redirect provider ; reprise via ?setup=git
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConnecting(null);
    }
  };

  const handleBind = async (externalRepoId: string) => {
    if (!project || !activeConnectionId) return;
    setBinding(true);
    try {
      await bindGitRepoApi(project.id, activeConnectionId, externalRepoId);
      toast.success(tSettings("gitRepoLinkedToast"));
      setActiveConnectionId(null);
      void queryClient.invalidateQueries({
        queryKey: projectGitLinkQueryKey(project.id),
      });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBinding(false);
    }
  };

  // ── Étape « Finitions » ───────────────────────────────────────────────────
  const finish = async () => {
    if (!project) return;
    setSubmitting(true);
    try {
      const updated = await updateProject(project.id, {
        smart_assign_enabled: smartAssignEnabled,
        auto_assign_enabled: autoAssignEnabled,
      });
      setProject(updated);

      if (feedbackEnabled) {
        const response = await fetch(`/api/projects/${project.id}/feedback/settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: true }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || "Error");
        }
        void queryClient.invalidateQueries({
          queryKey: ["feedback-settings", project.id],
        });
      }
      toast.success(t("wizardDoneToast", { name: project.name }));
      handleOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "project") void submitProjectStep();
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
      key: key || "MIND",
    }),
    icon: t("wizardIconDesc"),
    git: t("wizardGitDesc"),
    finish: t("wizardFinishSubtitle"),
  };

  const configuredProviderIds = providers.filter((p) => p.configured).map((p) => p.id);
  const LinkedIcon = link ? PROVIDER_ICON[link.provider] : null;

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
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5">
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
                      <div className="flex flex-col gap-1.5">
                        <label
                          htmlFor="project-key"
                          className="text-sm font-medium"
                        >
                          {t("keyLabel")}
                        </label>
                        <Input
                          id="project-key"
                          required
                          value={key}
                          onChange={(e) => {
                            setKeyTouched(true);
                            setKey(normalizeKey(e.target.value));
                          }}
                          placeholder="MIND"
                          className="w-28 font-mono uppercase tracking-wide"
                          maxLength={5}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("keyHint")}
                        </p>
                      </div>
                    </div>
                  )}

                  {step === "icon" && project && (
                    <ProjectIconPicker
                      centered
                      projectId={project.id}
                      iconUrl={project.icon_url}
                      onChanged={(iconUrl) =>
                        setProject((p) => (p ? { ...p, icon_url: iconUrl } : p))
                      }
                    />
                  )}

                  {step === "git" && project && (
                    <div className="flex flex-col gap-3">
                      {link && LinkedIcon ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                            <LinkedIcon className="size-5" strokeWidth={1.5} />
                          </span>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="truncate text-sm font-medium">
                              {link.repo_full_name ?? link.external_repo_id}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {getRepoProvider(link.provider).displayName}
                              {link.default_branch
                                ? ` · ${link.default_branch}`
                                : ""}
                            </p>
                          </div>
                        </div>
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
                              onChange={(v) => v && void handleBind(v)}
                              options={(candidates ?? []).map((c) => ({
                                value: c.external_repo_id,
                                label: c.full_name,
                              }))}
                              searchPlaceholder={tSettings("gitSearchRepo")}
                              emptyText={tSettings("gitNoRepos")}
                              align="center"
                              trigger={
                                <Button
                                  variant="outline"
                                  disabled={binding}
                                  className="justify-center"
                                >
                                  {binding ? <Spinner /> : null}
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
                            disabled={binding}
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

                  {step === "finish" && project && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
                        {/* Carré arrondi au ratio des cartes projet (≈ 0,28 —
                            11px @ 40px), bordé pour rester lisible quand le
                            favicon importé est rond ou transparent. */}
                        <ProjectOrb
                          seed={project.id}
                          iconUrl={project.icon_url}
                          className="size-10 rounded-[11px] border border-border"
                        />
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate text-sm font-medium">
                            {project.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{project.key}</span>
                            {link
                              ? ` · ${link.repo_full_name ?? link.external_repo_id}`
                              : ` · ${t("wizardNoRepo")}`}
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
