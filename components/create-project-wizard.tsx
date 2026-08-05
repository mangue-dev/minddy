"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
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
  FileUp,
  Github,
  Gitlab,
  Info,
  Layers,
  RefreshCw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import {
  isValidKey,
  normalizeKey,
  suggestKeyFromName,
} from "@/lib/project-key";
import { suggestProjectName } from "@/lib/project-name";
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
  clearPendingDraftId,
  setPendingDraftId,
  stepIndexOf,
  stepsFor,
  type DraftRepo,
  type DraftSeed,
  type ProjectDraft,
  type ProjectDraftInput,
  type ProjectOrigin,
  type ProjectWizardStep,
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
import {
  WizardDialog,
  type WizardStep,
} from "@/components/wizard/wizard-dialog";
import { ImportGuideBlock } from "@/components/import/import-guide";
import { NumoIcon } from "@/components/numo-icon";
import { WizardChoiceCard } from "@/components/wizard/wizard-choice-card";
import { CloseProjectDraftDialog } from "@/components/close-project-draft-dialog";
import { OnboardingJoinDialog } from "@/components/home/onboarding-join-dialog";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";
import type { CandidateRepo } from "@/lib/types";

/**
 * Wizard de création de projet (MIN-62, MIN-171) : D'où part-on ? → Projet →
 * Icône → Dépôt git → Amorce → Finitions.
 * La forme est celle de tous les wizards de minddy — modale, progression,
 * animation, boutons : `WizardDialog` (components/wizard/wizard-dialog.tsx).
 * Ce fichier ne décrit que ses étapes et ce qu'elles déclenchent.
 *
 * Le projet n'est créé qu'à la DERNIÈRE étape : tout ce qui précède est un
 * BROUILLON (nom, clé, favicon résolu mais pas stocké, dépôt choisi mais pas
 * lié). Fermer le wizard en route ne laisse donc pas de projet vide à moitié
 * configuré derrière soi. En contrepartie, chaque étape doit savoir travailler
 * sans projet :
 *  - l'icône ne fait que résoudre le favicon (`/api/account/project-icon`),
 *    l'import réel suit la création ;
 *  - le dépôt se choisit au niveau COMPTE (`/api/account/git-connections`), la
 *    liaison suit la création ;
 *  - l'id du projet est tiré ici, pour que l'orbe montrée dans le wizard soit
 *    bien celle du projet créé.
 *
 * Ce brouillon n'est plus perdu à la fermeture : dès qu'il porte un nom, il
 * s'enregistre côté serveur (lib/project-draft.ts, table `project_drafts`) et
 * prend une ligne dans la barre latérale, à la place du projet qu'il deviendra.
 * On y revient à l'étape où l'on s'était arrêté, d'une session à l'autre.
 *
 * L'installation GitHub / l'OAuth GitLab quittent la page en plein écran : le
 * brouillon est enregistré avant de partir, `sessionStorage` n'en garde que
 * l'id, et le callback revient sur `/home?setup=git` où `ProjectDraftResume`
 * rouvre le wizard à l'étape « Dépôt ».
 *
 * L'amorce suit la même règle que le reste : l'étape COLLECTE (un brief collé,
 * un CSV déposé), elle n'écrit rien. La passe qui en fait des tickets se joue
 * après la création, sur le board du projet neuf, où `?setup=` la déclenche.
 */

/** Reprise du wizard sur un brouillon — repris à la main, ou après un redirect. */
export interface ProjectSetupResumeState {
  draft: ProjectDraft;
  /** Connexion fraîchement créée par le callback — ouvre le sélecteur de dépôt. */
  connectionId: string | null;
  /**
   * Retour d'un aller-retour chez le provider git : on rouvre à l'étape
   * « Dépôt », d'où l'on était parti, et non à l'étape enregistrée — la sortie
   * de l'app n'était pas un abandon, c'était le milieu d'un geste.
   */
  fromGit?: boolean;
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
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    projects,
    createProject,
    updateProject,
    saveProjectDraft,
    deleteProjectDraft,
  } = useProjects();
  const { track } = useAnalytics();

  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le brouillon a-t-il déjà une ligne en base ? Ce qui décide, à la sortie, s'il
  // y a quelque chose à supprimer — et non s'il y a quelque chose à enregistrer,
  // qui ne dépend que du nom.
  const [draftExists, setDraftExists] = useState(false);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

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
  // Le dernier nom PROPOSÉ. Ce qui distingue « le champ porte une proposition »
  // de « le champ porte un nom choisi » : tant qu'il tient, on offre d'en tirer
  // un autre ; dès que l'utilisateur écrit, le nom est le sien.
  const [suggestedName, setSuggestedName] = useState("");

  // Étape « Icône » : rien n'est stocké tant que le projet n'existe pas — on
  // garde de quoi rejouer le choix à la création (favicon à ré-importer, ou
  // image déjà compressée à envoyer).
  const [icon, setIcon] = useState<ProjectIconChoice>({ kind: "none" });
  const iconPreviewUrl = icon.kind === "none" ? null : icon.previewUrl;

  // Étape « Dépôt git » — tout au niveau compte, aucun projet en jeu.
  const { connections, providers } = useGitConnectionsQuery(open);
  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null,
  );
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
  const step: ProjectWizardStep = steps[Math.min(stepIndex, steps.length - 1)];

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

  /** Une étape FACULTATIVE où rien n'a été posé dit « Passer », pas
   *  « Continuer ». Les deux avancent pareil — mais « Continuer » sur une étape
   *  vide laisse croire qu'on emporte quelque chose. */
  const skipLabel = (empty: boolean) =>
    empty ? tCommon("skip") : undefined;

  const reset = useCallback(() => {
    setStepIndex(0);
    setSubmitting(false);
    setError(null);
    setDraftExists(false);
    setClosePromptOpen(false);
    setJoinOpen(false);
    setDraftId(crypto.randomUUID());
    setOrigin(null);
    setName("");
    setKey("");
    setKeyTouched(false);
    setSuggestedName("");
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

  // Reprise d'un brouillon : il reprend toute sa place, et on rouvre là où on
  // l'avait laissé — à l'étape enregistrée, ou à l'étape git si l'on revient
  // d'un aller-retour chez le provider (sélecteur de dépôt ouvert si la
  // connexion a été créée).
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
    setDraftExists(true);
    setStepIndex(
      resume.fromGit
        ? stepsFor(draft.origin).indexOf("git")
        : stepIndexOf(draft),
    );
    setActiveConnectionId(resume.connectionId);
  }, [resume]);

  // Entonnoir du wizard (MIN-78) : ouverture, étape vue, abandon. Sans
  // « abandonné », on ne verrait que les projets créés — jamais l'étape qui
  // fait décrocher (la leçon AutoKap : c'était l'étape GitHub obligatoire).
  useTrackView(open, "opened", () =>
    track("project_wizard_opened", {
      source: resume?.fromGit ? "resume" : resume ? "draft" : "sidebar",
    }),
  );
  // Clé = l'étape : chaque étape atteinte est comptée une fois, revenir en
  // arrière ne la recompte pas (« combien de gens ont atteint l'étape N »).
  useTrackView(open, step, () => track("project_wizard_step_viewed", { step }));

  /** L'état complet du wizard, tel qu'il s'enregistre. */
  const snapshot = (): ProjectDraftInput => ({
    id: draftId,
    name: name.trim(),
    key,
    keyTouched,
    step,
    origin,
    seed,
    icon,
    repo,
    feedbackEnabled,
    smartAssignEnabled,
    autoAssignEnabled,
  });

  /** Ferme pour de bon : plus rien en attente, tout remis à zéro. */
  const closeWizard = useCallback(() => {
    clearPendingDraftId();
    setClosePromptOpen(false);
    reset();
    onOpenChange(false);
  }, [onOpenChange, reset]);

  /** Sortie « je reprendrai » : le brouillon part en base, la modale se ferme. */
  const saveAndClose = async () => {
    try {
      await saveProjectDraft(snapshot());
    } catch (err) {
      // Rien n'est enregistré et la modale reste ouverte : la saisie est encore
      // là, et fermer maintenant la perdrait pour de bon.
      setClosePromptOpen(false);
      toast.error((err as Error).message);
      return;
    }
    track("project_wizard_draft_saved", { step });
    closeWizard();
  };

  /** Sortie « j'y renonce » : le brouillon déjà enregistré s'en va avec. */
  const discardAndClose = () => {
    track("project_wizard_abandoned", { last_step: step });
    if (draftExists) {
      void deleteProjectDraft(draftId).catch((err: Error) => {
        console.error("[create-project-wizard] draft delete failed:", err);
      });
    }
    closeWizard();
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    // Dès qu'il y a un nom, il y a un brouillon à proposer : on ne referme pas
    // sur la saisie sans demander. Sans nom, il n'y a rien à montrer dans la
    // barre latérale — et rien à garder.
    if (name.trim()) {
      setClosePromptOpen(true);
      return;
    }
    discardAndClose();
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

  /**
   * Une proposition de nom, pour qui n'en a pas encore (MIN-170, mode « tout
   * nouveau projet »). Elle remplit le champ comme une frappe : la clé suit,
   * et tout reste modifiable — le projet n'est créé qu'à la dernière étape.
   *
   * On écarte ce qui ferait échouer la validation trois lignes plus bas (un nom
   * ou une clé déjà pris chez soi) et le nom affiché à l'instant, sinon le
   * bouton « en proposer un autre » peut ne rien changer.
   */
  const suggestName = () => {
    const mine = projects.filter((p) => p.owner_id === user?.id);
    const next = suggestProjectName(
      (candidate) =>
        candidate.toLowerCase() === name.trim().toLowerCase() ||
        mine.some(
          (p) =>
            p.name.toLowerCase() === candidate.toLowerCase() ||
            p.key === suggestKeyFromName(candidate),
        ),
    );
    setSuggestedName(next);
    handleNameChange(next);
  };

  /** Le champ porte encore la proposition — personne ne l'a réécrite depuis. */
  const showsSuggestion = suggestedName !== "" && name === suggestedName;

  /**
   * L'issue de secours de l'étape « nom », côté projet existant : ce n'est pas
   * un projet à créer qu'on avait, c'est celui de l'équipe à rejoindre. Le
   * wizard reste ouvert dessous — on n'a rien décidé, on est venu lire comment
   * on s'y prend.
   */
  const openJoin = () => {
    // Un abandon qui n'en est pas un : sans cet événement, ces comptes se
    // lisent comme des décrochages à l'étape du nom.
    track("project_wizard_join_opened");
    setJoinOpen(true);
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

  const handleConnect = async (provider: RepoProviderId) => {
    setConnecting(provider);
    track("git_connection_started", { provider });
    try {
      const res = await startAccountGitConnectApi(provider, "wizard");
      if (res.mode === "reuse") {
        setActiveConnectionId(res.connectionId);
      } else {
        // On quitte l'app : le brouillon part en base AVANT le redirect, et
        // sessionStorage n'en garde que l'id. Le callback revient sur
        // /home?setup=git, où ProjectDraftResume rouvre le wizard ici même.
        await saveProjectDraft(snapshot());
        setDraftExists(true);
        setPendingDraftId(draftId);
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
      (c) => c.external_repo_id === externalRepoId,
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
      // La langue de l'interface part AVEC la création : elle devient la
      // langue de l'équipe du projet, celle vers laquelle Numo traduira les
      // retours étrangers. C'est le seul moment où on peut la lire — l'app la
      // tient dans un cookie, jamais sur le compte.
      created = await createProject({
        id: draftId,
        name: name.trim(),
        key,
        locale,
      });
    } catch (err) {
      // Nom, clé déjà prise, limite de plan : tout se règle à la première étape,
      // et le brouillon reste intact — on n'a rien perdu.
      setStepIndex(0);
      setError((err as Error).message);
      setSubmitting(false);
      return;
    }

    // Le brouillon a fait son travail : le projet existe, il n'a plus lieu
    // d'être. Son échec de suppression ne remet rien en cause — au pire une
    // ligne de brouillon reste dans la barre latérale, et se jette d'un clic
    // droit.
    clearPendingDraftId();
    if (draftExists) {
      void deleteProjectDraft(draftId).catch((err: Error) => {
        console.error("[create-project-wizard] draft delete failed:", err);
      });
    }
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
      await enrich("icon", () =>
        importProjectIconApi(created.id, icon.siteUrl),
      );
    } else if (icon.kind === "file") {
      // L'aperçu est l'image compressée elle-même : la poser sur le projet ne
      // demande rien de plus que de la renvoyer telle quelle.
      await enrich("icon", () =>
        uploadProjectIconDataUrlApi(created.id, icon.previewUrl),
      );
    }
    if (repo) {
      const linked = await enrich("git bind", () =>
        bindGitRepoApi(created.id, repo.connectionId, repo.externalRepoId),
      );
      if (linked) track("project_git_linked", { provider: repo.provider });
    }
    if (smartAssignEnabled || autoAssignEnabled) {
      await enrich("assign settings", () =>
        updateProject(created.id, {
          smart_assign_enabled: smartAssignEnabled,
          auto_assign_enabled: autoAssignEnabled,
        }),
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
          },
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
    // `closeWizard` et non `handleOpenChange` : le projet est créé, il n'y a
    // plus de brouillon à proposer de garder.
    closeWizard();

    // L'amorce se joue sur le board du projet neuf : c'est le trou qu'on est en
    // train de combler, et rien de tout ça ne tiendrait dans une étape de wizard
    // (MIN-170). Ce qui a été saisi voyage en mémoire, l'URL ne porte que
    // l'instruction, et c'est le board qui ouvre la surface — le wizard vit
    // AU-DESSUS du panneau de Numo (`ProjectsProvider` le monte avant
    // `AssistantPanelProvider`), il n'a donc pas la main dessus.
    //
    // Un brief collé et « j'en parle » mènent au MÊME endroit : une
    // conversation. Le brief n'est pas un formulaire qu'une passe traite dans
    // son coin, c'est le premier message — Numo peut demander ce qui manque
    // avant de proposer quoi que ce soit.
    if (seed?.kind === "brief" || seed?.kind === "numo") {
      putSeedHandoff({
        kind: "numo",
        brief: seed.kind === "brief" ? seed.text : null,
      });
      router.push(`/projects/${created.id}?setup=numo`);
    } else if (seed?.kind === "import" && csvFile) {
      putSeedHandoff({ kind: "import", file: csvFile });
      router.push(`/projects/${created.id}?setup=import`);
    } else {
      router.push(`/projects/${created.id}`);
    }
  };

  const configuredProviderIds = providers
    .filter((p) => p.configured)
    .map((p) => p.id);
  const RepoIcon = repo ? PROVIDER_ICON[repo.provider] : null;

  /**
   * Les étapes, décrites. Le parcours retenu est `steps` (l'amorce dépend de
   * l'origine) : ce qui n'y figure pas n'est ni rendu, ni compté.
   */
  const stepDefs: Record<
    ProjectWizardStep,
    WizardStep<ProjectWizardStep>
  > = {
    // Le tout premier geste de minddy : deux portes côte à côte, de même poids,
    // qui se lisent d'un coup d'œil. Chacune montre sa scène — un terrain nu où
    // une carte se pose, une pile de cartes déjà là — et une ligne pour la
    // nommer : c'est le dessin qui fait le choix, le libellé confirme.
    origin: {
      id: "origin",
      title: t("wizardOriginTitle"),
      subtitle: t("wizardOriginDesc"),
      // Les deux portes respirent plus large que les champs des étapes
      // suivantes : c'est le seul écran où l'on regarde avant de lire.
      wide: true,
      // Un choix binaire qui demande deux gestes est un choix binaire mal posé :
      // la carte cliquée pose la réponse ET avance, un CTA ne ferait que
      // redemander confirmation de ce qui vient d'être dit.
      hideSubmit: true,
      content: (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          role="radiogroup"
          aria-label={t("wizardOriginTitle")}
        >
          {(
            [
              { id: "new", icon: Sparkles, label: t("wizardOriginNewLabel") },
              {
                id: "existing",
                icon: Layers,
                label: t("wizardOriginExistingLabel"),
              },
            ] as const
          ).map(({ id, icon, label }) => (
            <WizardChoiceCard
              key={id}
              icon={icon}
              label={label}
              selected={origin === id}
              onSelect={() => chooseOrigin(id)}
            />
          ))}
        </div>
      ),
    },

    project: {
      id: "project",
      title: t("wizardProjectTitle"),
      subtitle: t("dialogDescription", {
        entityPlural: tIssue("entityPlural").toLowerCase(),
      }),
      content: (
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="project-name" className="text-sm font-medium">
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
              {/* La clé demande une explication, pas un hint permanent sous le
                  champ : elle tient dans un tooltip au survol du « i », et le
                  sous-titre de l'étape parle du projet. */}
              <div className="flex items-center gap-1">
                <label htmlFor="project-key" className="text-sm font-medium">
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

          {/* Un projet qui n'existe pas encore n'a pas forcément de nom, et le
              wizard ne peut pas avancer sans. Plutôt que de bloquer sur un
              champ vide : un nom de code, tiré au sort, qu'on rejoue autant de
              fois qu'on veut — et qui se renomme comme n'importe quel autre.
              Rien à proposer à qui reprend un projet existant : celui-là a déjà
              son nom. */}
          {origin === "new" &&
            (showsSuggestion ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={suggestName}
                      aria-label={t("wizardNameSuggestAnother")}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("wizardNameSuggestAnother")}
                  </TooltipContent>
                </Tooltip>
                <span>{t("wizardNameSuggestHint")}</span>
              </div>
            ) : name.trim() === "" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={suggestName}
                className="h-auto self-start bg-transparent px-0 py-1 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
              >
                <Sparkles className="size-3.5" />
                {t("wizardNameSuggest")}
              </Button>
            ) : null)}

          {/* L'autre chose qu'on peut vouloir ici, et que rien ne disait : ne
              pas créer de projet du tout. Qui arrive par « un projet existant »
              parce que son équipe est déjà sur minddy s'apprêtait à en créer un
              DOUBLON — alors qu'il n'y a qu'à s'y faire inviter. Le lien
              n'ouvre qu'une explication, le wizard reste là dessous : on ne
              rejoint pas de son propre chef dans minddy, c'est le propriétaire
              du projet qui invite. */}
          {origin === "existing" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openJoin}
              className="h-auto self-start bg-transparent px-0 py-1 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <UserPlus className="size-3.5" />
              {t("wizardJoinLink")}
            </Button>
          )}
        </div>
      ),
    },

    icon: {
      id: "icon",
      title: t("wizardIconTitle"),
      subtitle: t("wizardIconDesc"),
      content: (
        <ProjectIconPicker
          centered
          projectId={null}
          seed={draftId}
          iconUrl={iconPreviewUrl}
          onChanged={setIcon}
        />
      ),
    },

    git: {
      id: "git",
      title: t("wizardGitTitle"),
      subtitle: t("wizardGitDesc"),
      submitLabel: skipLabel(!repo),
      content: (
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
      ),
    },

    seed: {
      id: "seed",
      title:
        origin === "existing"
          ? t("wizardSeedImportTitle")
          : t("wizardSeedBriefTitle"),
      subtitle:
        origin === "existing"
          ? t("wizardSeedImportDesc")
          : t("wizardSeedBriefDesc", {
              entityPlural: tIssue("entityPlural").toLowerCase(),
            }),
      submitLabel: skipLabel(!seed),
      submitDisabled: briefTooLong,
      content:
        origin === "existing" ? (
          <div className="flex flex-col gap-3">
            {/* Où trouver le CSV, outil par outil — la même marche à suivre que
                les réglages et l'onboarding. Demander un export sans dire où il
                se prend, c'est renvoyer chercher dans la doc de l'outil qu'on
                quitte. Le fichier déposé, elle a fini son travail. */}
            {!csvFile && <ImportGuideBlock />}
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
                      : "border-border hover:border-ring/60 focus-visible:border-ring",
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
        ) : (
          <div className="flex flex-col gap-2">
            <Textarea
              autoFocus
              value={brief}
              onChange={(e) => {
                setBrief(e.target.value);
                // Écrire, c'est reprendre la main : le choix de passer par Numo
                // ne tient plus.
                if (numo) setNumo(false);
              }}
              placeholder={t("wizardSeedPlaceholder")}
              aria-label={t("wizardSeedBriefTitle")}
              rows={8}
              className="max-h-[40vh] min-h-40 overflow-y-auto"
            />
            {/* Le compteur n'apparaît qu'aux abords du plafond : avant, il
                n'apprend rien et met une limite sous les yeux de qui ne
                l'atteindra jamais. */}
            {brief.length > MAX_BRIEF_CHARS * 0.75 && (
              <span
                className={cn(
                  "self-end font-mono text-xs tabular-nums",
                  brief.length > MAX_BRIEF_CHARS
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {t("wizardSeedCounter", {
                  count: brief.length,
                  max: MAX_BRIEF_CHARS,
                })}
              </span>
            )}

            {/* L'autre entrée du mode « nouveau projet » (MIN-173) : en parler
                plutôt que coller. C'est une porte, pas une note de bas de page —
                elle se voit et se clique comme le bouton d'à côté. */}
            <div className="mt-1 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" aria-hidden />
              <span className="text-xs text-muted-foreground">
                {tCommon("or")}
              </span>
              <span className="h-px flex-1 bg-border" aria-hidden />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => {
                setNumo(true);
                setBrief("");
                leaveSeedStep({ kind: "numo" });
              }}
            >
              <NumoIcon state="idle" className="size-4" />
              {t("wizardSeedNumoLink")}
            </Button>
          </div>
        ),
    },

    finish: {
      id: "finish",
      title: t("wizardFinishTitle"),
      subtitle: t("wizardFinishSubtitle"),
      submitLabel: t("wizardFinish"),
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
            {/* Carré arrondi au ratio des cartes projet (≈ 0,28 — 11px @ 40px),
                bordé pour rester lisible quand le favicon importé est rond ou
                transparent. */}
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
              <span className="text-sm font-medium">
                {t("wizardSmartAssignLabel")}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("wizardSmartAssignDesc")}
              </span>
            </span>
            <Switch
              checked={smartAssignEnabled}
              onCheckedChange={setSmartAssignEnabled}
            />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
            <span className="flex min-w-0 flex-col gap-0.5 text-left">
              <span className="text-sm font-medium">
                {t("wizardAutoAssignLabel")}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {t("wizardAutoAssignDesc")}
              </span>
            </span>
            <Switch
              checked={autoAssignEnabled}
              onCheckedChange={setAutoAssignEnabled}
            />
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
      ),
    },
  };

  return (
    <>
      <WizardDialog
        open={open}
        onOpenChange={handleOpenChange}
        label={t("newProject")}
        steps={steps.map((id) => stepDefs[id])}
        stepIndex={stepIndex}
        onStepIndexChange={goToStep}
        submitting={submitting}
        error={
          error ??
          (briefTooLong
            ? t("wizardSeedTooLong", { max: MAX_BRIEF_CHARS })
            : null)
        }
        onSubmit={(id) => {
          if (id === "project") submitProjectStep();
          else if (id === "seed") leaveSeedStep(seed);
          else if (id === "finish") void finish();
          else setStepIndex((i) => i + 1);
        }}
      />
      {/* Ce qu'on demande à la fermeture : garder, renoncer, ou revenir. Monté
          en frère du wizard (et non dedans) — le wizard reste ouvert dessous
          tant qu'on n'a pas tranché, et « Continuer la configuration » le rend
          tel qu'on l'a laissé. */}
      <CloseProjectDraftDialog
        open={closePromptOpen}
        onOpenChange={setClosePromptOpen}
        onSave={() => void saveAndClose()}
        onDiscard={discardAndClose}
      />

      {/* La marche à suivre pour se faire inviter — la même qu'à l'étape 1 de
          l'onboarding, à un mot près : le wizard s'ouvre de n'importe où, donc
          l'invitation s'annonce là où elle attend depuis partout, l'inbox. */}
      <OnboardingJoinDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        outro="inbox"
      />
    </>
  );
}
