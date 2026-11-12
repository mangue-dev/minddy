"use client";

import { projectPath } from "@/lib/app-urls";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, FileUploadIcon, Mail01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { createUuid } from "@/lib/create-uuid";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppRouter } from "@/lib/use-app-router";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingRegion } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Github, Gitlab } from "@/components/git/provider-icons";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import {
  isValidKey,
  normalizeKey,
  suggestKeyFromName,
} from "@/lib/project-key";
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
import { inviteCollaboratorApi, inviteMemberApi } from "@/lib/members-api";
import { useCollaboratorsQuery } from "@/lib/use-collaborators-query";
import { matchCollaborators } from "@/lib/collaborator-search";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import {
  CollaboratorName,
  CollaboratorSuggestions,
} from "@/components/collaborator-suggestions";
import { usePlanGates } from "@/lib/use-billing-query";
import { isValidEmail } from "@/lib/auth-entry";
import {
  clearPendingDraftId,
  normalizeInviteEmail,
  normalizeInvitees,
  normalizeInviteeUsers,
  setPendingDraftId,
  stepIndexOf,
  PROJECT_WIZARD_STEPS,
  type DraftInviteeUser,
  type DraftRepo,
  type DraftSeed,
  type ProjectDraft,
  type ProjectDraftInput,
  type ProjectOrigin,
  type ProjectWizardStep,
} from "@/lib/project-draft";
import { putSeedHandoff } from "@/lib/project-seed-handoff";
import { MAX_IMPORT_CSV_BYTES } from "@/lib/import/types";
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
import { HelpHint } from "@/components/settings/help-hint";
import { CloseProjectDraftDialog } from "@/components/close-project-draft-dialog";
import { OnboardingJoinDialog } from "@/components/home/onboarding-join-dialog";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";
import type { CandidateRepo, Collaborator } from "@/lib/types";
import { TruncatedText } from "@/components/ui/truncated-text";

/**
 * Project creation wizard (MIN-62, MIN-171, MIN-689): Where do we start? →
 * Project → Icon → Git repository → Primer → Members → Finishings.
 * The form is that of all minddy wizards — modal, progression,
 * animation, and buttons: `WizardDialog` (components/wizard/wizard-dialog.tsx).
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
 * The import step collects a CSV without writing anything; after project
 * creation the import continues on the new project board through
 * `?setup=import`. It comes after the members step (MIN-907): the team is
 * invited before its issues arrive.
 *
 * The members step only queues people: an address, or someone who already
 * joined another of the owner's projects, found by name. The invitations go
 * out once the project exists, through the same endpoint as the members
 * settings, which stays the judge of limits, duplicates and who counts as a
 * collaborator.
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
  const router = useAppRouter();
  const t = useTranslations("Projects");
  const tSettings = useTranslations("Settings");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("Issue");
  const tMembers = useTranslations("Members");
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
  const { maxMembersPerProject } = usePlanGates();
  const createdProjectRef = useRef<Awaited<ReturnType<typeof createProject>> | null>(null);
  /** One number per opening of the wizard, bumped by `reset()`. The close
      button stays live while `finish()` runs: a result that comes back after
      the wizard was closed belongs to an opening that no longer exists, and
      must not write into the fresh one. */
  const sessionRef = useRef(0);

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
  // One route since MIN-907: the project carries existing work over, its
  // issues imported from a CSV when there are any. The draft keeps the field.
  const [origin, setOrigin] = useState<ProjectOrigin | null>("existing");

  // “Project” stage. `draftId` is the id of the future project: the seed of the orb
  // must be known before creation, otherwise the preview lies.
  const [draftId, setDraftId] = useState<string>(() => createUuid());
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
  // Derived, not stored: a connection is open and its repositories have not
  // arrived yet. A separate flag stayed on when the connection was closed or
  // the wizard reset mid-request.
  const candidatesLoading = !!activeConnectionId && candidates === null;
  const [repo, setRepo] = useState<DraftRepo | null>(null);

  // “Import” stage. It collects, it does not write: the CSV remains a `File`
  // in memory, no network call here, the project does not exist yet.
  const [csvFile, setCsvFile] = useState<File | null>(null);
  // A CSV does not fit in sessionStorage: the detour via the git provider
  // forget it. We ask it again, and we SAY it — otherwise the empty drop zone
  // looks like a bug.
  const [csvLost, setCsvLost] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // “Finishing” stage. Smart Assign is proposed ENABLED: this is the setting
  // that we want by default on a new project, and unchecking it remains one click away.
  const [smartAssignEnabled, setSmartAssignEnabled] = useState(true);

  // “Members” stage. Addresses and picked collaborators wait here until the
  // project exists; `inviteeInput` is the name or address being typed.
  const [invitees, setInvitees] = useState<string[]>([]);
  const [inviteeUsers, setInviteeUsers] = useState<DraftInviteeUser[]>([]);
  const [inviteeInput, setInviteeInput] = useState("");
  const [inviteeError, setInviteeError] = useState<string | null>(null);
  // The owner takes no guest slot: the plan limit counts invitees only, as the
  // server counts non-owner members plus pending invitations.
  const queuedCount = invitees.length + inviteeUsers.length;
  const inviteLimitReached =
    maxMembersPerProject != null && queuedCount >= maxMembersPerProject;
  // People who joined another of my projects, proposed by name. Read only:
  // picking one sends nothing until Finish, where the server checks again.
  const collaborators = useCollaboratorsQuery(open);

  const steps = PROJECT_WIZARD_STEPS;
  const step: ProjectWizardStep = steps[Math.min(stepIndex, steps.length - 1)];

  /** The primer as it is at this moment — deduced, never stored two
   * times: this is what the draft carries and what `finish()` replays. */
  const seed: DraftSeed | null = useMemo(() => (csvFile ? { kind: "import" } : null), [csvFile]);

  /** An OPTIONAL step where nothing has been placed says "Skip", not
   * " Continue ". Both progress the same — but “Continue” on one step
   *  empty step would imply that something has been added. */
  const skipLabel = (empty: boolean) =>
    empty ? tCommon("skip") : undefined;

  const reset = useCallback(() => {
    sessionRef.current += 1;
    createdProjectRef.current = null;
    setStepIndex(0);
    setSubmitting(false);
    setError(null);
    setDraftExists(false);
    setClosePromptOpen(false);
    setJoinOpen(false);
    setDraftId(createUuid());
    setOrbSeed(null);
    setOrigin("existing");
    setName("");
    setKey("");
    setKeyTouched(false);
    setIcon({ kind: "none" });
    setConnecting(null);
    setActiveConnectionId(null);
    setCandidates(null);
    setRepo(null);
    setCsvFile(null);
    setCsvLost(false);
    setSmartAssignEnabled(true);
    setInvitees([]);
    setInviteeUsers([]);
    setInviteeInput("");
    setInviteeError(null);
  }, []);

  // Resumption of a draft: it takes its place again, and we reopen where we
  // had left it — at the saved step, or at the git step if we return
  // a round trip to the provider (deposit selector open if the
  // connection has been created).
  useEffect(() => {
    if (!resume) return;
    const { draft } = resume;
    createdProjectRef.current = null;
    setDraftId(draft.id);
    setOrbSeed(draft.orbSeed);
    setOrigin("existing");
    setName(draft.name);
    setKey(draft.key);
    setKeyTouched(draft.keyTouched);
    setIcon(draft.icon);
    setRepo(draft.repo);
    // The CSV did not make the trip (see `DraftSeed`): the drop zone
    // leaves empty, with the note that explains why.
    setCsvFile(null);
    setCsvLost(draft.seed?.kind === "import");
    setSmartAssignEnabled(draft.smartAssignEnabled);
    setInvitees(draft.invitees);
    setInviteeUsers(draft.inviteeUsers);
    setInviteeInput("");
    setInviteeError(null);
    setDraftExists(true);
    setStepIndex(
      resume.fromGit
        ? PROJECT_WIZARD_STEPS.indexOf("git")
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
    invitees,
    inviteeUsers,
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

  // ── “Members” stage ──────────────────────────────────────────────────────
  /** Who may be queued by address: plausible, and not the owner. */
  const isInvitable = (email: string) =>
    isValidEmail(email) &&
    email !== normalizeInviteEmail(user?.email ?? "");

  const isQueued = (email: string) =>
    invitees.includes(email) || inviteeUsers.some((u) => u.email === email);

  /** Collaborators matching what is typed, minus those already queued. */
  const suggestions = inviteLimitReached
    ? []
    : matchCollaborators(collaborators, inviteeInput, {
        userIds: inviteeUsers.map((u) => u.userId),
        emails: invitees,
      });

  const pickCollaborator = (c: Collaborator) => {
    if (inviteLimitReached) return;
    setInviteeUsers((list) => [
      ...list,
      { userId: c.user_id, email: c.email, name: c.full_name, avatarSeed: c.avatar_seed },
    ]);
    setInviteeInput("");
    setInviteeError(null);
  };

  /**
   * Adds what is typed to the queue. Returns `false` when it is refused, with
   * the reason shown under the field — so that “Continue” never drops what the
   * user typed without saying so. An address that belongs to a collaborator,
   * or a name only one collaborator matches, queues that person.
   */
  const addInvitee = (): boolean => {
    const email = normalizeInviteEmail(inviteeInput);
    if (!email) return true;
    const known = collaborators.find((c) => c.email === email);
    if (isQueued(email)) {
      setInviteeError(
        t("wizardMembersDuplicate", { email: known ? displayName(known, email) : email }),
      );
      return false;
    }
    if (inviteLimitReached) {
      setInviteeError(
        tMembers("inviteLimitReached", { limit: maxMembersPerProject ?? 0 }),
      );
      return false;
    }
    if (known) {
      pickCollaborator(known);
      return true;
    }
    if (!isValidEmail(email)) {
      if (suggestions.length === 1) {
        pickCollaborator(suggestions[0]);
        return true;
      }
      setInviteeError(t("wizardMembersInvalid"));
      return false;
    }
    if (email === normalizeInviteEmail(user?.email ?? "")) {
      setInviteeError(t("wizardMembersSelf"));
      return false;
    }
    setInvitees((list) => [...list, email]);
    setInviteeInput("");
    setInviteeError(null);
    return true;
  };

  const leaveMembersStep = () => {
    if (!addInvitee()) return;
    setStepIndex((i) => i + 1);
  };

  // ── “Project” stage ─────────────────────────── ───────────────────────────
  const handleNameChange = (value: string) => {
    setName(value);
    if (!keyTouched) setKey(suggestKeyFromName(value));
  };


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
    setCandidates(null);
    fetchAccountGitCandidatesApi(activeConnectionId)
      .then((res) => {
        // Loading is derived from `null`: a response without a list must
        // still end it.
        if (!cancelled) setCandidates(res.candidates ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error((err as Error).message);
          setActiveConnectionId(null);
        }
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
    if (submitting) return;
    /**
     * Closing the wizard while this runs (its close button stays live) ends
     * this opening: nothing below may write into the fresh wizard. What still
     * happens depends on how far it got. Closed before the create request is
     * sent: no project is created, the close wins. Closed after: the project
     * exists whatever the wizard does, so its setup (icon, repository,
     * settings, invitations the user confirmed with Finish) still completes
     * and the success toast says it exists, but the user is not navigated
     * away from where they chose to stay.
     */
    const session = sessionRef.current;
    const stale = () => session !== sessionRef.current;
    setSubmitting(true);
    setError(null);


    // A failed page write may be retried here or resumed from its saved draft.
    let created = createdProjectRef.current ?? projects.find((p) => p.id === draftId);
    try {
      // The language of the interface leaves WITH the creation: it becomes the
      // language of the project team, the one into which Numo will translate the
      // foreign returns. This is the only time you can read it — the app
      // fits in a cookie, never on the account.
      if (!created) {
        if (stale()) return;
        created = await createProject({
          id: draftId,
          orb_seed: orbSeed,
          name: name.trim(),
          key,
          locale,
        });
        track("project_created", {
          has_icon: icon.kind !== "none",
          has_git_link: !!repo,
        });
      }
      if (!stale()) createdProjectRef.current = created;
    } catch (err) {
      if (stale()) {
        toast.error((err as Error).message);
        return;
      }
      // Name, key already taken, plan limit: everything is settled in the first step,
      // and the draft remains intact — nothing has been lost.
      setStepIndex(0);
      setError((err as Error).message);
      setSubmitting(false);
      return;
    }

    // The project exists: its draft has nothing left to keep.
    clearPendingDraftId();
    if (draftExists) {
      void deleteProjectDraft(draftId).catch((err: Error) => {
        console.error("[create-project-wizard] draft delete failed:", err);
      });
    }

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
    if (smartAssignEnabled) {
      await enrich("assign settings", () =>
        updateProject(created.id, { smart_assign_enabled: smartAssignEnabled }),
      );
    }
    // Invitations go out last, one by one: a refusal (plan limit, rate limit,
    // already invited) does not stop the next ones, and none of them undoes
    // the project. A success means an invitation was recorded, not that its
    // email was delivered.
    // Picked collaborators go by account: the server resolves their address
    // and checks again that they joined one of my projects.
    const toInvite = [
      ...normalizeInviteeUsers(inviteeUsers).map((u) => ({
        label: displayName({ full_name: u.name, email: u.email }, u.email),
        send: () => inviteCollaboratorApi(created.id, u.userId),
      })),
      ...normalizeInvitees(invitees).filter(isInvitable).map((email) => ({
        label: email,
        send: () => inviteMemberApi(created.id, email),
      })),
    ];
    if (toInvite.length > 0) {
      const failed: { label: string; message: string }[] = [];
      for (const { label, send } of toInvite) {
        try {
          await send();
        } catch (err) {
          console.error("[create-project-wizard] invitation failed:", err);
          failed.push({ label, message: (err as Error).message });
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["members", created.id] });
      if (failed.length > 0) {
        // Persistent: it names who was not invited, and the wizard is about
        // to close — a toast that fades would leave no trace of it.
        toast.error(t("wizardMembersFailedTitle", { count: failed.length }), {
          description: (
            <div className="flex flex-col gap-1">
              <ul className="flex flex-col gap-0.5">
                {failed.map(({ label, message }) => (
                  <li key={label} className="break-words">
                    {label} — {message}
                  </li>
                ))}
              </ul>
              <p>{t("wizardMembersFailedHint")}</p>
            </div>
          ),
          duration: Infinity,
        });
      }
    }

    // The icon and settings are applied after creation: the cached list
    // already dates back before.
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    track("project_wizard_completed", {
      has_git_link: !!repo,
      smart_assign_enabled: smartAssignEnabled,
      invitations: toInvite.length,
    });
    toast.success(t("wizardDoneToast", { name: created.name }));
    if (stale()) return;
    setSubmitting(false);
    // `closeWizard` and not `handleOpenChange`: the project is created, there is no
    // no more draft to offer to keep.
    closeWizard();

    // CSV imports continue on the board; a brief only creates its page.
    if (seed?.kind === "import" && csvFile) {
      putSeedHandoff({ kind: "import", file: csvFile });
      router.push(`${projectPath(created)}?setup=import`);
    } else {
      router.push(projectPath(created));
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
    project: {
      id: "project",
      title: t("wizardProjectTitle"),
      // Not a project to create but a team to join: the way there sits with
      // the step's buttons, between Continue and Back (MIN-907).
      secondaryAction: { label: t("wizardJoinLink"), icon: UserAdd01Icon, onClick: openJoin },
      subtitle: t("dialogDescription", {
        entityPlural: tIssue("entityPlural").toLowerCase(),
      }),
      content: (
        <div className="flex flex-col gap-2">
          {/* Side by side on a computer, stacked on a phone (MIN-907). */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="project-name" className="text-sm font-medium">
                {t("nameLabel")}
              </label>
              <Input
                id="project-name"
                autoFocus={allowInputAutoFocus()}
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
            <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-28">
              {/* The key requires an explanation, not a permanent hint under the
 field: it fits in a tooltip when hovering over the "i", and the
 subtitle of the step talks about the project. */}
              <div className="flex items-center gap-1">
                <label htmlFor="project-key" className="text-sm font-medium">
                  {t("keyLabel")}
                </label>
                {/* A tap opens it as well as a hover: a tooltip never opened on
                    a phone (MIN-907). */}
                <HelpHint label={t("keyTooltipLabel")}>
                  {t("keyTooltip", {
                    entityPlural: tIssue("entityPlural").toLowerCase(),
                    key: key || "MIND",
                  })}
                </HelpHint>
              </div>
              <Input
                id="project-key"
                required
                value={key}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(normalizeKey(e.target.value));
                }}
                className="font-mono uppercase tracking-wide"
                maxLength={5}
              />
            </div>
          </div>

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
                  <TruncatedText text={repo.fullName} className="truncate text-sm font-medium" />
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
                <LoadingRegion label={tSettings("gitLoadingRepos")}>
                  <Skeleton className="h-9 w-44" />
                </LoadingRegion>
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
      title: t("wizardSeedImportTitle"),
      subtitle: t("wizardSeedImportDesc"),
      submitLabel: skipLabel(!seed),
      content: (
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
            // Second time: the file is here, and imported once the project exists.
            <div className="flex items-center gap-3 rounded-2xl border border-border p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                <HugeiconsIcon icon={FileUploadIcon} className="size-5" strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1 text-left">
                <TruncatedText text={csvFile.name} className="truncate text-sm font-medium" />
                <p className="truncate text-xs text-muted-foreground">{t("wizardSeedFileReady")}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={tCommon("remove")}
                onClick={() => {
                  setCsvFile(null);
                  if (csvInputRef.current) csvInputRef.current.value = "";
                }}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </Button>
            </div>
          ) : (
            // First time: where the issues come from, how to export them
            // there, and the file.
            <>
              <ImportGuideBlock foldSteps />
              <Button type="button" variant="outline" className="h-11 w-full gap-2" onClick={() => csvInputRef.current?.click()}>
                <HugeiconsIcon icon={FileUploadIcon} />
                {t("wizardSeedChooseFile")}
              </Button>
              {csvLost && (
                <p className="text-center text-xs text-muted-foreground">{t("wizardSeedFileLost")}</p>
              )}
            </>
          )}
        </div>
      ),
    },

    members: {
      id: "members",
      title: t("wizardMembersTitle"),
      subtitle: t("wizardMembersDesc"),
      submitLabel: skipLabel(queuedCount === 0 && !inviteeInput.trim()),
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="project-invitee" className="sr-only">
                {t("wizardMembersFieldLabel")}
              </label>
              <Input
                id="project-invitee"
                type="text"
                autoComplete="off"
                autoFocus={allowInputAutoFocus()}
                value={inviteeInput}
                onChange={(e) => {
                  setInviteeInput(e.target.value);
                  setInviteeError(null);
                }}
                onKeyDown={(e) => {
                  // Enter adds the address and stays: the wizard's own Enter
                  // would move on before the next address is typed.
                  if (e.key === "Enter" && inviteeInput.trim()) {
                    e.preventDefault();
                    addInvitee();
                  }
                }}
                placeholder={t("wizardMembersPlaceholder")}
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="project-invitee-suggestions"
                aria-autocomplete="list"
                aria-invalid={inviteeError ? true : undefined}
                aria-describedby={inviteeError ? "project-invitee-error" : undefined}
                disabled={inviteLimitReached}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => addInvitee()}
              disabled={inviteLimitReached || !inviteeInput.trim()}
            >
              <HugeiconsIcon icon={UserAdd01Icon} />
              {tCommon("add")}
            </Button>
          </div>
          {inviteeError && (
            <p role="alert" id="project-invitee-error" className="text-xs text-destructive">
              {inviteeError}
            </p>
          )}
          <CollaboratorSuggestions
            id="project-invitee-suggestions"
            label={t("wizardMembersSuggestionsLabel")}
            suggestions={suggestions}
            onPick={pickCollaborator}
          />
          {queuedCount > 0 && (
            <ul
              className="flex flex-col divide-y divide-border rounded-2xl border border-border"
              aria-label={t("wizardMembersListLabel")}
            >
              {inviteeUsers.map((u) => (
                <li key={u.userId} className="flex items-center gap-3 py-2 pl-4 pr-2">
                  <UserAvatar seed={u.avatarSeed} className="size-7" />
                  <CollaboratorName collaborator={{ email: u.email, full_name: u.name }} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("wizardMembersRemove", {
                      email: displayName({ full_name: u.name, email: u.email }, u.email),
                    })}
                    onClick={() => {
                      setInviteeUsers((list) => list.filter((x) => x.userId !== u.userId));
                      setInviteeError(null);
                    }}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} />
                  </Button>
                </li>
              ))}
              {invitees.map((email) => (
                <li key={email} className="flex items-center gap-3 py-2 pl-4 pr-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <HugeiconsIcon icon={Mail01Icon} className="size-3.5" aria-hidden />
                  </span>
                  <TruncatedText text={email} className="min-w-0 flex-1 truncate text-left text-sm" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("wizardMembersRemove", { email })}
                    onClick={() => {
                      setInvitees((list) => list.filter((e) => e !== email));
                      setInviteeError(null);
                    }}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-left text-xs text-muted-foreground">
            {t("wizardMembersHint")}
            {maxMembersPerProject != null && (
              <>
                {" "}
                <span className="tabular-nums">
                  {inviteLimitReached
                    ? tMembers("inviteLimitReached", { limit: maxMembersPerProject })
                    : tMembers("guestCount", {
                        used: queuedCount,
                        limit: maxMembersPerProject,
                      })}
                </span>
              </>
            )}
          </p>
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
              <TruncatedText text={name} className="truncate text-sm font-medium" />
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{key}</span>
                {repo ? ` · ${repo.fullName}` : ` · ${t("wizardNoRepo")}`}
              </p>
              {queuedCount > 0 && (
                <p className="truncate text-xs text-muted-foreground">
                  {t("wizardMembersSummary", { count: queuedCount })}
                </p>
              )}
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
        error={error}
        onSubmit={(id) => {
          if (id === "project") submitProjectStep();
          else if (id === "seed") leaveSeedStep(seed);
          else if (id === "members") leaveMembersStep();
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
