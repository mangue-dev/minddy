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
  cn,
  toast,
} from "mangue-ui";
import {
  FileUp,
  Info,
  Layers,
  RefreshCw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Github, Gitlab } from "@/components/git/provider-icons";
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
import { createPageApi } from "@/lib/pages-api";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Project creation wizard (MIN-62, MIN-171): Where do we start? → Project →
 * Icon → Git repository → Primer → Finishings.
 * The form is that of all minddy wizards — modal, progression,
 * animation, boutons : `WizardDialog` (components/wizard/wizard-dialog.tsx).
 * This file only describes its steps and what they trigger.
 *
 * The project is only created at the LAST step: everything above is a
 * DRAFT (name, key, favicon resolved but not stored, repository chosen but not
 * related). Closing the wizard en route therefore does not leave a project half empty
 * configured behind you. In return, each step must know how to work
 * without project:
 * - the icon only resolves the favicon (`/api/account/project-icon`),
 * the actual import follows the creation;
 * - the deposit is chosen at the ACCOUNT level (`/api/account/git-connections`), the
 * connection follows creation;
 * - the project id is pulled here, so that the orb shown in the wizard is
 * that of the created project.
 *
 * This draft is no longer lost when closed: as soon as it has a name, it
 * is registered on the server side (lib/project-draft.ts, table `project_drafts`) and
 * takes a line in the sidebar, in place of the project it will become.
 * We return to the stage where we left off, from one session to the next.
 *
 * The GitHub installation / GitLab OAuth leaves the page in full screen: the
 * draft is saved before leaving, `sessionStorage` only keeps
 * the id, and the callback returns to `/home?setup=git` where `ProjectDraftResume`
 * reopens the wizard to the “Deposit” step.
 *
 * The primer follows the same rule as the rest: the COLLECTION step (a pasted brief,
 * a CSV submitted), she writes nothing. The pass that makes tickets is played
 * after creation, on the board of the new project, where `?setup=` triggers it.
 */

/** Resumption of the wizard on a draft — resumed manually, or after a redirect. */
export interface ProjectSetupResumeState {
  draft: ProjectDraft;
  /** Connection freshly created by callback — opens the repository selector. */
  connectionId: string | null;
  /**
   * Return from a round trip to the git provider: we reopen at the stage
   * “Deposit”, where we started from, and not at the recorded stage — the exit
   * of the app was not an abandonment, it was the middle of a gesture.
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
  /** New object on each restart — triggers initialization at the git stage. */
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

  // Does the draft already have a baseline? What decides, at the exit, if it
  // is something to delete — not if there is something to record,
  // which depends only on the name.
  const [draftExists, setDraftExists] = useState(false);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  // Step “Where do we start from?” » — the answer decides what the bootstrap step
  // request, and nothing else: the project is created in the same way from both
  // sides.
  const [origin, setOrigin] = useState<ProjectOrigin | null>(null);

  // “Project” stage. `draftId` is the id of the future project: the seed of the orb
  // must be known before creation, otherwise the preview lies.
  const [draftId, setDraftId] = useState<string>(() => crypto.randomUUID());
  // The seed of the orb if we relaunched it here - otherwise the id acts, like
  // for a project that never relaunched its own.
  const [orbSeed, setOrbSeed] = useState<string | null>(null);
  const previewOrbSeed = orbSeed ?? draftId;
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  // The last PROPOSED name. What distinguishes “the field carries a proposition”
  // of “the field bears a chosen name”: as long as it holds, we offer to draw from it
  // another ; as soon as the user writes, the name is theirs.
  const [suggestedName, setSuggestedName] = useState("");

  // “Icon” step: nothing is stored until the project exists — we
  // keep enough to replay the choice at creation (favicon to re-import, or
  // already compressed image to send).
  const [icon, setIcon] = useState<ProjectIconChoice>({ kind: "none" });
  const iconPreviewUrl = icon.kind === "none" ? null : icon.previewUrl;

  // “Git repository” step — everything counts, no project involved.
  const { connections, providers } = useGitConnectionsQuery(open);
  const [connecting, setConnecting] = useState<RepoProviderId | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null,
  );
  const [candidates, setCandidates] = useState<CandidateRepo[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [repo, setRepo] = useState<DraftRepo | null>(null);

  // “Prime” stage. She collects, she does not write: the brief remains a
  // text, the CSV remains a `File` in memory — no network calls here, the
  // project does not yet exist.
  const [brief, setBrief] = useState("");
  const [numo, setNumo] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  // A CSV does not fit in sessionStorage: the detour via the git provider
  // forget it. We ask it again, and we SAY it — otherwise the empty drop zone
  // looks like a bug.
  const [csvLost, setCsvLost] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // “Finishing” stage. Smart Assign is proposed ENABLED: this is the setting
  // that we want by default on a new project, and unchecking it remains one click away.
  const [smartAssignEnabled, setSmartAssignEnabled] = useState(true);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);

  const steps = useMemo(() => stepsFor(origin), [origin]);
  const step: ProjectWizardStep = steps[Math.min(stepIndex, steps.length - 1)];

  /** The primer as it is at this moment — deduced, never stored two
   * times: this is what the draft carries and what `finish()` replays. */
  const seed: DraftSeed | null = useMemo(() => {
    if (origin === "existing") return csvFile ? { kind: "import" } : null;
    if (numo) return { kind: "numo" };
    return brief.trim() ? { kind: "brief", text: brief.trim() } : null;
  }, [origin, csvFile, numo, brief]);

  // The ceiling of the pass (lib/seed/types.ts): refusing it here avoids having to
  // discover after the creation of the project, on the board.
  const briefTooLong = step === "seed" && brief.length > MAX_BRIEF_CHARS;

  /** An OPTIONAL step where nothing has been placed says "Skip", not
   * " Continue ". Both progress the same — but “Continue” on one step
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
    setOrbSeed(null);
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
    setSmartAssignEnabled(true);
    setAutoAssignEnabled(false);
  }, []);

  // Resumption of a draft: it takes its place again, and we reopen where we
  // had left it — at the saved step, or at the git step if we return
  // a round trip to the provider (deposit selector open if the
  // connection has been created).
  useEffect(() => {
    if (!resume) return;
    const { draft } = resume;
    setDraftId(draft.id);
    setOrbSeed(draft.orbSeed);
    setOrigin(draft.origin);
    setName(draft.name);
    setKey(draft.key);
    setKeyTouched(draft.keyTouched);
    setIcon(draft.icon);
    setRepo(draft.repo);
    setBrief(draft.seed?.kind === "brief" ? draft.seed.text : "");
    setNumo(draft.seed?.kind === "numo");
    // The CSV did not make the trip (see `DraftSeed`): the drop zone
    // leaves empty, with the note that explains why.
    setCsvFile(null);
    setCsvLost(draft.seed?.kind === "import");
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

  // Wizard's Funnel (MIN-78): opening, step seen, abandonment. Without
  // “abandoned”, we would only see the projects created — never the step that
  // made you drop out (the AutoKap lesson: it was the obligatory GitHub step).
  useTrackView(open, "opened", () =>
    track("project_wizard_opened", {
      source: resume?.fromGit ? "resume" : resume ? "draft" : "sidebar",
    }),
  );
  // Key = step: each step reached is counted once, go back
  // back does not count it again (“how many people reached step N”).
  useTrackView(open, step, () => track("project_wizard_step_viewed", { step }));

  /** The complete state of the wizard, as it is saved. */
  const snapshot = (): ProjectDraftInput => ({
    id: draftId,
    orbSeed,
    name: name.trim(),
    key,
    keyTouched,
    step,
    origin,
    seed,
    icon,
    repo,
    smartAssignEnabled,
    autoAssignEnabled,
  });

  /** Closes for good: nothing left waiting, everything reset. */
  const closeWizard = useCallback(() => {
    clearPendingDraftId();
    setClosePromptOpen(false);
    reset();
    onOpenChange(false);
  }, [onOpenChange, reset]);

  /** “I will resume” output: the draft goes to the base, the modal closes. */
  const saveAndClose = async () => {
    try {
      await saveProjectDraft(snapshot());
    } catch (err) {
      // Nothing is recorded and the modal remains open: the entry is still
      // there, and closing now would lose it for good.
      setClosePromptOpen(false);
      toast.error((err as Error).message);
      return;
    }
    track("project_wizard_draft_saved", { step });
    closeWizard();
  };

  /** “I give it up” output: the draft already recorded goes with it. */
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
    // As soon as there is a name, there is a draft to propose: we do not close
    // on entering without asking. Without a name, there is nothing to show in the
    // sidebar — and nothing to keep.
    if (name.trim()) {
      setClosePromptOpen(true);
      return;
    }
    discardAndClose();
  };

  /** Return to steps already validated only (stepper + return link). */
  const goToStep = (target: number) => {
    if (submitting) return;
    if (target >= 0 && target < stepIndex) setStepIndex(target);
  };

  // ── “Where do we start from?” step » ─────────────────────── ───────────────────────
  // A binary choice that requires two gestures is an ill-posed binary choice: the
  // Clicked card poses the answer AND moves forward.
  const chooseOrigin = (next: ProjectOrigin) => {
    setOrigin(next);
    // Changing your mind does not drag the beginning of the other branch behind you.
    if (next !== origin) {
      setBrief("");
      setNumo(false);
      setCsvFile(null);
      setCsvLost(false);
    }
    track("project_wizard_origin_chosen", { origin: next });
    setStepIndex((i) => i + 1);
  };

  // ── “Prime” step ─────────────────────────── ───────────────────────────
  const handleCsvFile = (file: File) => {
    if (file.size > MAX_IMPORT_CSV_BYTES) {
      toast.error(tSettings("importErrorTooLarge"));
      return;
    }
    setCsvFile(file);
    setCsvLost(false);
  };

  /** Exit the bootstrap step, regardless of the path ("Continue",
   * “Skip”, the link to Numo): the choice is counted once, there. */
  const leaveSeedStep = (chosen: DraftSeed | null) => {
    track("project_wizard_seed_chosen", { seed: chosen?.kind ?? "none" });
    setStepIndex((i) => i + 1);
  };

  // ── “Project” stage ─────────────────────────── ───────────────────────────
  const handleNameChange = (value: string) => {
    setName(value);
    if (!keyTouched) setKey(suggestKeyFromName(value));
  };

  /**
   * A suggested name, for those who don't have one yet (MIN-170, “all
   * new project"). It fills the field like a keystroke: the key follows,
   * and everything remains editable — the project is only created at the last step.
   *
   * We exclude anything that would cause the validation to fail three lines below (a name
   * or a key already taken from home) and the name displayed at the moment, otherwise the
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

  /** The field still bears the proposition — no one has rewritten it since. */
  const showsSuggestion = suggestedName !== "" && name === suggestedName;

  /**
   * The emergency exit of the “name” step, on the existing project side: this is not
   * a project to create that we had is that of the team to join. THE
   * wizard remains open underneath — we haven't decided anything, we came to read how
   * on s'y prend.
   */
  const openJoin = () => {
    // An abandonment which is not one: without this event, these accounts will
    // read like dropouts at the name stage.
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
    // The key is unique per owner: checking it here avoids discovering the
    // conflict three steps later, at the time of creation. The server remains the judge
    // (another tab, another device) — it's just an advanced safeguard.
    if (projects.some((p) => p.owner_id === user?.id && p.key === finalKey)) {
      setError(t("keyTaken", { key: finalKey }));
      return;
    }
    setKey(finalKey);
    setStepIndex((i) => i + 1);
  };

  // ── “Git repository” step ───────────────────────── ──────────────────────────
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
      } else if (res.mode === "claim") {
        // Relay-only instance: the official App is claimed through the relay.
        // The draft goes to the database BEFORE the redirect, and the
        // interstitial returns to /home?setup=git, where ProjectDraftResume
        // reopens the wizard right here.
        await saveProjectDraft(snapshot());
        setDraftExists(true);
        setPendingDraftId(draftId);
        const params = new URLSearchParams({
          code: res.code,
          return: "/home?setup=git",
        });
        window.location.href = `/connect/github?${params.toString()}`;
      } else {
        // We leave the app: the draft goes to the database BEFORE the redirect, and
        // sessionStorage only keeps the id. The callback returns to
        // /home?setup=git, where ProjectDraftResume reopens the wizard right here.
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
    // Chosen, not yet linked: the link needs a project, it is waiting for the
    // creation.
    setRepo({
      connectionId: connection.id,
      provider: connection.provider,
      externalRepoId: candidate.external_repo_id,
      fullName: candidate.full_name,
    });
    setActiveConnectionId(null);
  };

  // ── Creation (last step) ────────────────────── ───────────────────────
  const finish = async () => {
    setSubmitting(true);
    setError(null);

    let created;
    try {
      // The language of the interface leaves WITH the creation: it becomes the
      // language of the project team, the one into which Numo will translate the
      // foreign returns. This is the only time you can read it — the app
      // fits in a cookie, never on the account.
      created = await createProject({
        id: draftId,
        orb_seed: orbSeed,
        name: name.trim(),
        key,
        locale,
      });
    } catch (err) {
      // Name, key already taken, plan limit: everything is settled in the first step,
      // and the draft remains intact — nothing has been lost.
      setStepIndex(0);
      setError((err as Error).message);
      setSubmitting(false);
      return;
    }

    // The draft has done its job: the project exists, it no longer takes place
    // to be. Its failure to delete does not call anything into question — at worst a
    // draft line remains in the sidebar, and is thrown with a click
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

    // From here the project EXISTS: each of the finishes can fail without
    // call creation into question. We say it, we continue, we don't cancel anything.
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
      // The preview is the compressed image itself: placing it on the project does not
      // asks for nothing more than to send it back as is.
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
    // The pasted brief becomes a PAGE of the wiki, “Initial Brief”, even before
    // let's talk to Numo about it.
    //
    // It is not a disposable form: it is the text where someone has asked
    // what he wants to build, and until now he only survived in the form
    // of the first message in a conversation — not found three weeks later
    // late, when we wonder precisely what was planned in the
    // departure. A page is found, reread, corrected, and Numo reads it
    // par ses outils comme n'importe quelle autre.
    //
    // A finish among others: its failure does not prevent the project
    // to exist, and the conversation starts with the brief anyway.
    if (seed?.kind === "brief" && seed.text.trim()) {
      await enrich("brief page", () =>
        createPageApi(created.id, {
          title: t("wizardBriefPageTitle"),
          icon: "📝",
          // The text goes MARKDOWN: the projection is made to the server, by
          // the same path as the pages written by the agent — a pasted brief
          // in markdown therefore arrives with its titles and its lists, and a brief
          // in bare text with its paragraphs.
          markdown: seed.text.trim(),
        }),
      );
    }
    if (smartAssignEnabled || autoAssignEnabled) {
      await enrich("assign settings", () =>
        updateProject(created.id, {
          smart_assign_enabled: smartAssignEnabled,
          auto_assign_enabled: autoAssignEnabled,
        }),
      );
    }
    // The icon and settings are applied after creation: the cached list
    // already dates back before.
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    track("project_wizard_completed", {
      has_git_link: !!repo,
      smart_assign_enabled: smartAssignEnabled,
      auto_assign_enabled: autoAssignEnabled,
    });
    toast.success(t("wizardDoneToast", { name: created.name }));
    setSubmitting(false);
    // `closeWizard` and not `handleOpenChange`: the project is created, there is no
    // no more draft to offer to keep.
    closeWizard();

    // The beginning is played out on the board of the new project: this is the hole we are in
    // filling in, and none of that would fit in a wizard stage
    // (MIN-170). What was entered travels in memory, the URL only carries
    // instruction, and it is the board which opens the surface - the wizard lives
    // ABOVE Numo's sign (`ProjectsProvider` climbs it before
    // `AssistantPanelProvider`), so he has no control over it.
    //
    // A pasted brief and “I’m talking about it” lead to the SAME place: a
    // conversation. The brief is not a form that a pass processes in
    // his corner is the first message — Numo can ask what is missing
    // before proposing anything.
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
   * The steps, described. The chosen route is `steps` (the start depends on
   * origin): what is not there is neither returned nor counted.
   */
  const stepDefs: Record<
    ProjectWizardStep,
    WizardStep<ProjectWizardStep>
  > = {
    // Minddy's very first gesture: two doors side by side, of the same weight,
    // which can be read at a glance. Each shows its scene — a bare field where
    // a card is placed, a pile of cards already there — and a line for the
    // name: it is the drawing that makes the choice, the wording confirms.
    origin: {
      id: "origin",
      title: t("wizardOriginTitle"),
      subtitle: t("wizardOriginDesc"),
      // The two doors breathe wider than the fields of steps
      // following: this is the only screen where you look before reading.
      wide: true,
      // A binary choice that requires two gestures is an ill-posed binary choice:
      // the clicked card poses the answer AND moves forward, a CTA would only
      // ask again for confirmation of what has just been said.
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
              {/* The key requires an explanation, not a permanent hint under the
 field: it fits in a tooltip when hovering over the "i", and the
 subtitle of the step talks about the project. */}
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

          {/* A project that does not yet exist does not necessarily have a name, and the
 wizard cannot advance without it. Rather than blocking on an empty field: a code name, drawn at random, which we replay as many times as we want — and which is renamed like any other.
 Nothing to offer to anyone taking over an existing project: this one already has
 its name. */}
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

          {/* The other thing we can want here, and that nothing said: don't
 not create a project at all. Who arrives through “an existing project”
 because his team is already on minddy was preparing to create a DOUBLON
 — when all you have to do is be invited. The link
 only opens an explanation, the wizard remains there below: we do not join
 on our own in minddy, it is the owner
 of the project who invites. */}
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
          seed={previewOrbSeed}
          iconUrl={iconPreviewUrl}
          onChanged={setIcon}
          onSeedChanged={setOrbSeed}
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
            {/* Where to find the CSV, tool by tool — the same procedure as
 settings and onboarding. Requesting an export without saying where it
 is taken is to go back to looking in the docs of the tool that you
 is leaving. The file deposited, she finished her work. */}
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
                // Writing is taking back control: the choice to go through Numo
                // ne tient plus.
                if (numo) setNumo(false);
              }}
              placeholder={t("wizardSeedPlaceholder")}
              aria-label={t("wizardSeedBriefTitle")}
              rows={8}
              className="max-h-[40vh] min-h-40 overflow-y-auto"
            />
            {/* The counter only appears near the ceiling: before, it
 learns nothing and puts a limit before the eyes of who will never reach it. */}
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

            {/* The other entry into “new project” mode (MIN-173): talk about it
 rather than paste. It's a door, not a footnote —
 it can be seen and clicked like the button next to it. */}
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
            {/* Square rounded to the ratio of the project cards (≈ 0.28 — 11px @ 40px),
 bordered to remain readable when the imported favicon is round or
 transparent. */}
            <ProjectOrb
              seed={previewOrbSeed}
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
      {/* What we ask at closing: keep, give up, or return. Mounted
 in brother of the wizard (and not inside) — the wizard remains open under
 until we decide, and "Continue configuration" makes it
 as we left it. */}
      <CloseProjectDraftDialog
        open={closePromptOpen}
        onOpenChange={setClosePromptOpen}
        onSave={() => void saveAndClose()}
        onDiscard={discardAndClose}
      />

      {/* The procedure to follow to get invited — the same as in step 1 of
 onboarding, except for one word: the wizard opens from anywhere, so
 the invitation is announced where it is waiting from everywhere, the inbox. */}
      <OnboardingJoinDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        outro="inbox"
      />
    </>
  );
}
