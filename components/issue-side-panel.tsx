"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  SidePanelTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  ChevronRight,
  GitPullRequest,
  MoreHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  AssigneeValue,
  CategoryValue,
  DueDateValue,
  EffortValue,
  ObjectiveValue,
  PriorityValue,
  PropertyRow,
  StatusValue,
} from "@/components/issue-property-fields";
import { TAB_LIST_DENSE, TAB_TRIGGER_DENSE } from "@/components/tab-bar";
import { SubIssuesSection } from "@/components/sub-issues-section";
import { RelationsSection } from "@/components/relations-section";
// Deferred: the agent conversation carries the whole AI streaming stack
// (streamdown + shiki) — it must not ride along on every board navigation.
// The modal only mounts once a run exists AND the user opens it.
const AgentChatModal = dynamic(
  () => import("@/components/agent/agent-chat-modal").then((m) => m.AgentChatModal),
  { ssr: false }
);
import { IssueAgentChip } from "@/components/agent/issue-agent-chip";
import { ChainStatusBar } from "@/components/automations/chain-status-bar";
import { useAgentMenuActions } from "@/components/agent/use-agent-menu-actions";
import {
  CustomPromptDialog,
  type CustomPromptTarget,
} from "@/components/agent/custom-prompt-dialog";
import {
  IssueActionsMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { useIssueAgentRunsQuery } from "@/lib/use-agent-runs";
import { handOffIssueApi, isAgentRunWorking } from "@/lib/agent-api";
import {
  setAgentComposeDraft,
  type AgentComposeIntent,
} from "@/lib/agent-compose-draft";
import { usePlanGates } from "@/lib/use-billing-query";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { useProjectGitLinkQuery } from "@/lib/use-project-git-link-query";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import {
  agentLaunchPromptVariant,
  agentPlanPromptVariant,
} from "@/lib/agent-launch-prompt";
import {
  buildIssueCustomPrompt,
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
} from "@/lib/issue-prompt";
import { useMyCycleQuery } from "@/lib/use-my-cycle-query";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { RelationChips, type ChipRelation } from "@/components/relation-chips";
import { resolveRelations } from "@/lib/relation-constants";
import {
  IssueShortcutMenu,
  useIssueFieldShortcuts,
} from "@/components/issue-field-shortcuts";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import { IssueResourcesSection } from "@/components/issue-resources-section";
import { IssuePlan } from "@/components/issue-plan";
// Deferred editor: keeps tiptap (~1.5 MB) out of the board routes that mount
// this panel — see markdown-editor-lazy.tsx. Warmed from idle time below.
import {
  MarkdownEditor,
  useIdleMarkdownEditorPreload,
} from "@/components/markdown-editor-lazy";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { hasPlanTasks, planProgress } from "@/lib/plan";
import { AutoTextarea } from "@/components/auto-textarea";
import { useAuth } from "@/lib/auth-context";
import { useIssueTimeline } from "@/lib/use-issue-timeline";
import { useIssueDictation } from "@/lib/use-issue-dictation";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { issueIdentifier } from "@/lib/issue-constants";
import { DocumentTitle } from "@/components/document-title";
import { IntegrationIndicator } from "@/components/integration-indicator";
import { RemoteIssueIndicator } from "@/components/remote-issue-indicator";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import type {
  Category,
  CreateIssueInput,
  Issue,
  IssueDraftPatch,
  IssueRelation,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
} from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function IssueSidePanel({
  issue,
  open,
  onOpenChange,
  projectKey,
  members,
  categories,
  objectives,
  allIssues,
  relations,
  onUpdate,
  onDelete,
  onSetCategories,
  onCreate,
  onOpenIssue,
  onAddRelation,
  onRemoveRelation,
  initialTab = "description",
}: {
  issue: Issue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  allIssues: Issue[];
  /** Every project relation row (raw); resolved for this issue below. */
  relations: IssueRelation[];
  onUpdate: (issueId: string, updates: IssueUpdateInput) => Promise<unknown>;
  onDelete: (issueId: string) => Promise<void>;
  onSetCategories: (issueId: string, categoryIds: string[]) => Promise<void>;
  onCreate: (input: CreateIssueInput) => Promise<unknown>;
  onOpenIssue: (id: string) => void;
  onAddRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  onRemoveRelation: (relationId: string) => void;
  /** Tab to show when the panel (re)opens on a new issue. */
  initialTab?: "description" | "plan";
}) {
  const { siteName } = useRuntimeConfig();
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tPlan = useTranslations("Plan");
  const tAgent = useTranslations("Agent");
  // The panel mounts with its board: warm the editor chunk once the page has
  // painted, so opening a ticket never shows the loading fallback.
  useIdleMarkdownEditorPreload();
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"description" | "plan">(initialTab);
  // Remount the description editor when the description is rewritten under it
  // (dictation, or distant writing) — it only reads `value` during editing and
  // ne commite qu'au blur.
  const [editorKey, setEditorKey] = useState(0);
  const { data: githubIssueData } = useQuery<{ github_metadata?: Record<string, unknown> | null }>({
    queryKey: ["github-issue-metadata", issue?.id ?? ""],
    queryFn: async () => {
      const response = await fetch(`/api/issues/${issue?.id}`);
      if (!response.ok) throw new Error("Failed to load GitHub issue metadata");
      return response.json();
    },
    enabled: !!issue && issue.remote_provider === "github",
  });
  const githubMetadata = githubIssueData?.github_metadata ?? null;

  /**
   * Follow the REMOTE writings while the panel remains open (MIN-89).
   *
   * The rest of the panel reads `issue` directly: status, priority, plan, links
   * therefore follow the cache as soon as the real-time bridge invalidates it. The title and
   * description, they are LOCAL copies — a state for one, a value
   * read during editing by the editor for the other — sown when opening the ticket
   * and never repeated afterwards. An agent (Numo, MCP, teammate) could therefore
   * rewrite both without the screen moving, until reload.
   *
   * The rule: adopt the remote version, NEVER over a keystroke. A
   * field which has the focus, or retouched without being committed yet, keeps control.
   */
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  /** Ticket whose local copies below carry the version. */
  const shownFor = useRef<string | null>(null);
  /** Latest SERVER version already reflected on the screen: distinguishes a writing
      distant (to be adopted) from the echo of our own edition (already displayed). */
  const shownTitle = useRef("");
  const shownDescription = useRef("");
  /** Retouched by hand since the last sync. Without these two flags, one
      a simple round trip of the focus would recommit the outdated reflection of the field —
      i.e. would undo the edit the agent just wrote. */
  const titleEdited = useRef(false);
  const descriptionEdited = useRef(false);
  // Agent conversation, in modal ABOVE the panel: hot restart
  // must not cost the context of the ticket (the card has nothing to lose
  // and navigate to /agents).
  const [chatOpen, setChatOpen] = useState(false);
  // “Personalized”: the free instructions dialog, opened either to copy the
  // prompt, or to launch the agent (`null` = closed).
  const [customTarget, setCustomTarget] = useState<CustomPromptTarget | null>(null);

  const { items, addComment, updateComment, deleteComment, deleteAttachment } =
    useIssueTimeline(
      issue?.id ?? null,
      // The ticket bears its own birth: enough to open its timeline itself
      // when the `created` event is missing (see lib/use-issue-timeline.ts).
      issue
        ? {
            createdAt: issue.created_at,
            createdBy: issue.created_by,
            integrationId: issue.integration_id ?? null,
          }
        : null
    );

  // Code agent of this ticket. Same derivations as maps (lib/server/
  // agent/activity.ts), but from the runs of the issue alone: ​​the panel
  // also opens where the board activity provider does not exist (Pull page
  // requests, feedback board). The PR travels with it, served by the same route and
  // read on `pull_requests`: a ticket can carry one without any run.
  const { runs, pullRequest } = useIssueAgentRunsQuery(issue?.id ?? null);
  const { agentsAllowed } = usePlanGates();
  // Agent + PR unavailable without linked deposit (MIN-80): the server rejects all
  // way a `noRepo` launch, we therefore remove the option upstream. Permissive as long
  // that the query loads → no flash on the current case (project WITH repository).
  const { link: repoLink, loading: repoLinkLoading } = useProjectGitLinkQuery(
    issue?.project_id ?? null
  );
  // In the desktop app a local run needs NO linked repository: it plays on the
  // folder attached to this machine. In the browser the link stays the only
  // door (the server refuses a `noRepo` cloud launch anyway).
  const desktopAvailable = useMemo(() => !!getDesktopBridge(), []);
  const agentsEnabled =
    agentsAllowed && (repoLinkLoading || repoLink != null || desktopAvailable);
  const agentWorking = runs.some((r) => isAgentRunWorking(r.status));
  const latestRun = runs[0] ?? null;
  // A restartable conversation exists (at least one non-`failed` run).
  const hasAgentSession = runs.some((r) => r.status !== "failed");

  // Cycle (MIN-32): the panel reads the current cycle itself rather than
  // brought down by its four callers — the hook is already spoiled by the
  // user preferences, so costs nothing when cycles are off.
  const { currentCycle, nextCycle } = useMyCycleQuery();
  const onSetIssueCycle = useCallback(
    (target: Issue, cycleId: string | null) =>
      void onUpdate(
        target.id,
        // Mirrors the server side-effect: adding assigns to me, never a status bump.
        cycleId && user?.id
          ? { cycle_id: cycleId, assignee_id: user.id }
          : { cycle_id: cycleId }
      ).catch((err) => toast.error((err as Error).message)),
    [onUpdate, user?.id]
  );
  const buildCycleActions = useCycleMenuActions(
    currentCycle?.id ?? null,
    nextCycle?.id ?? null,
    onSetIssueCycle
  );

  // Land on the tab the opener asked for (plan indicator → plan tab).
  useEffect(() => {
    setTab(initialTab);
  }, [issue?.id, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Title and description: sown when the ticket is opened, then kept up to date on
  // remote writes (see refs above).
  useEffect(() => {
    if (!issue) return;
    const description = issue.description ?? "";

    // Different ticket: everything starts from him. The publisher is already going back on his side
    // (its `key` carries `issue.id`), there is only the state of the title to sow.
    if (shownFor.current !== issue.id) {
      shownFor.current = issue.id;
      shownTitle.current = issue.title;
      shownDescription.current = description;
      titleEdited.current = false;
      descriptionEdited.current = false;
      setTitle(issue.title);
      return;
    }

    // A version that we refuse to adopt is NOT noted: it remains “in
    // waiting", and the field takes it as soon as it returns control (commitTitle for
    // the title, the blur of the container for the description).
    if (
      issue.title !== shownTitle.current &&
      !titleEdited.current &&
      document.activeElement !== titleRef.current
    ) {
      shownTitle.current = issue.title;
      setTitle(issue.title);
    }

    // The editor does not reread `value`: to adopt it is to reassemble it — the same
    // lever than dictation. So never while writing there.
    if (
      description !== shownDescription.current &&
      !descriptionEdited.current &&
      !descriptionRef.current?.contains(document.activeElement)
    ) {
      shownDescription.current = description;
      setEditorKey((k) => k + 1);
    }
  }, [issue?.id, issue?.title, issue?.description]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => planProgress(issue?.plan), [issue?.plan]);
  // A plan already exists → the “plan” entries (menu ⋯, Plan tab, prompt
  // copied, Numo agent) toggle from “generate” to “verify”.
  const issueHasPlan = hasPlanTasks(issue?.plan);

  // This issue's relations, resolved to the display shape (with the other
  // issue's number) and priority-sorted. Numbers come from allIssues so a
  // filtered-out target still resolves.
  const resolvedRelations = useMemo<ChipRelation[]>(() => {
    if (!issue) return [];
    const byId = new Map(allIssues.map((i) => [i.id, i]));
    const statusById = new Map(allIssues.map((i) => [i.id, i.status]));
    return resolveRelations(issue.id, relations, statusById)
      .map((r) => {
        const other = byId.get(r.otherId);
        return other ? { ...r, otherNumber: other.number } : null;
      })
      .filter((r): r is ChipRelation => r !== null);
  }, [issue?.id, relations, allIssues]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Agent de code (MIN-46 / MIN-68) ──────────────────────────────────────
  // Two entry points, as on the maps:
  // • open the existing conversation — here in modal on the last run, to
  // keep the ticket in front of you (the card navigates to /agents);
  // • start a NEW session — create an optimistic draft of the composition and
  // opens its composer (`?compose=`), even if the ticket already has a session.
  const composeAgentSession = useCallback(
    (prompt: string, intent: AgentComposeIntent = "implement") => {
      if (!issue) return;
      setAgentComposeDraft({
        kind: "issue",
        issueId: issue.id,
        issueNumber: issue.number,
        issueTitle: issue.title,
        projectId: issue.project_id,
        projectKey,
        prompt,
        intent,
      });
      router.push(`/agents?compose=${issue.id}`);
    },
    [issue, projectKey, router]
  );

  const startNewAgentSession = useCallback(() => {
    if (!issue) return;
    // “Implement the ticket” ALWAYS arrives with its pre-written instructions
    // (ticket context, tailored to their plan/effort) — like the other three
    // ways of working from the same submenu. She left empty when the ticket
    // already had a session, on the grounds that the context was inherited: from place
    // from the user, the same menu entry populated the dial once
    // out of two, without anything announcing the difference.
    const identifier = issueIdentifier(projectKey, issue.number);
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier })}\n\n${tAgent(`launchPrompt.${agentLaunchPromptVariant(issue)}`)}`,
    );
  }, [issue, projectKey, composeAgentSession, tAgent]);

  // “Write with Numo” / “Check the plan with Numo” (Plan tab):
  // new session whose instructions are to FRAME the ticket — write the plan
  // when there is none, take it again point by point when it exists — then
  // stop. Always a new session, even if the ticket already has one: the
  // composer opens with the instruction, the user sends it (or the fine).
  // `intent: "plan"`: this launch does NOT start the ticket (the
  // server does not pass it "in progress") — planning is not starting.
  const writePlanWithAgent = useCallback(() => {
    if (!issue) return;
    const identifier = issueIdentifier(projectKey, issue.number);
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier })}\n\n${tAgent(`launchPrompt.${agentPlanPromptVariant(issue)}`)}`,
      "plan"
    );
  }, [issue, projectKey, composeAgentSession, tAgent]);

  // “Check implementation”: new session that rereads the work ALREADY done
  // facing the plan and the ticket comments, then fixes the proven bugs.
  // `intent: "verify"`: the ticket does not move — check the work done
  // is not the start, and a review ticket must remain there.
  const verifyWithAgent = useCallback(() => {
    if (!issue) return;
    const identifier = issueIdentifier(projectKey, issue.number);
    composeAgentSession(
      `${tAgent("launchPrompt.head", { identifier })}\n\n${tAgent("launchPrompt.verifyImplementation")}`,
      "verify"
    );
  }, [issue, projectKey, composeAgentSession, tAgent]);

  // ⇧A: ticket already with a session → we open it; otherwise we start a new one.
  // Plan without agents (MIN-72): the shortcut is inert, the menu entries absent.
  const launchAgent = useCallback(() => {
    if (!agentsEnabled) return;
    if (hasAgentSession) setChatOpen(true);
    else startNewAgentSession();
  }, [agentsEnabled, hasAgentSession, startNewAgentSession]);

  // `?pr=` and not `?run=`: the link must work as well for a PR as for no run
  // has not opened — a human PR, or a hand-attached PR (MIN-163).
  const openPr = useCallback(() => {
    if (pullRequest) router.push(`/pull-requests?pr=${pullRequest.prId}`);
  }, [pullRequest, router]);

  // Context shared by the two copyable prompts (work on the ticket,
  // write your plan): resolved relationships and category names.
  const promptContext = useMemo(() => {
    if (!issue) return null;
    const titleById = new Map(allIssues.map((i) => [i.id, i.title]));
    return {
      relations: resolvedRelations.map((r) => ({
        type: r.relation,
        identifier: issueIdentifier(projectKey, r.otherNumber),
        title: titleById.get(r.otherId) ?? "",
      })),
      // Category names (IDs live on the issue, names in `categories`).
      categories: issue.category_ids
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter((name): name is string => !!name),
    };
  }, [issue, allIssues, resolvedRelations, categories, projectKey]);

  const copyPrompt = useCallback(async () => {
    if (!issue || !promptContext) return;
    // Copying a prompt means giving the work to someone else — an agent
    // external, oneself. The chain that was waiting for this suspended ticket is canceled
    // therefore (MIN-147). HERE and not in the menu: the buttons on the Map tab and
    // the shortcut ⇧P call this callback DIRECTLY, and therefore skip
    // l'enveloppe qui n'existait qu'au niveau du menu ⋯.
    handOffIssueApi(issue.id);
    // MIN-20: copy the prompt starts the ticket (option enabled by default,
    // can be deactivated in Account → Preferences). We only advance the statutes
    // pre-work, and the toast only signals the trip if it has taken place.
    const autoStart =
      resolvePromptCopyAutoStart(user?.user_metadata) &&
      shouldAutoStartOnPromptCopy(issue.status);
    // The copied XML must reflect the REAL state after movement: if we pass the
    // “In progress” ticket, the prompt already describes it `in_progress`, not the old one.
    const promptIssue = autoStart
      ? { ...issue, status: "in_progress" as const }
      : issue;
    await navigator.clipboard.writeText(
      buildIssuePrompt({
        issue: promptIssue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        resourceCount: issue.resource_count,
      })
    );
    if (autoStart) {
      void onUpdate(issue.id, { status: "in_progress" }).catch((err) =>
        toast.error((err as Error).message)
      );
      toast.success(t("promptCopiedMoved"));
    } else {
      toast.success(t("promptCopied"));
    }
  }, [issue, promptContext, projectKey, user?.user_metadata, onUpdate, t]);

  // “Copy prompt” from the Plan tab: the same ticket, but instructions
  // FRAMING (write the plan when it is missing, check it point by point
  // when it exists — `buildIssuePlanPrompt` toggles alone) for an agent
  // external, which will record it on the ticket via the MCP. No start
  // automatic here: planning is not starting the work.
  const copyPlanPrompt = useCallback(async () => {
    if (!issue || !promptContext) return;
    // Getting started: the suspended chain is canceled (MIN-147).
    handOffIssueApi(issue.id);
    await navigator.clipboard.writeText(
      buildIssuePlanPrompt({
        issue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        resourceCount: issue.resource_count,
      })
    );
    toast.success(
      tPlan(issueHasPlan ? "reviewPromptCopied" : "planPromptCopied")
    );
  }, [issue, promptContext, projectKey, issueHasPlan, tPlan]);

  // “Check the implementation” on the copied prompt side: the CONTROL instruction
  // (reread the work against the plan and the comments, correct the real ones
  // bugs) for an external agent. No automatic start: we reread some
  // work already done, we are not starting it.
  const copyVerifyPrompt = useCallback(async () => {
    if (!issue || !promptContext) return;
    // Getting started: the suspended chain is canceled (MIN-147).
    handOffIssueApi(issue.id);
    await navigator.clipboard.writeText(
      buildIssueVerifyPrompt({
        issue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        resourceCount: issue.resource_count,
      })
    );
    toast.success(t("verifyPromptCopied"));
  }, [issue, promptContext, projectKey, t]);

  // “Customized”: the instruction entered in the dialog replaces the instruction
  // ready made — the context of the ticket remains provided by minddy (block
  // <issue> of the copied prompt; session context on the Numo agent side). None
  // automatic start: we do not know if this instruction is work.
  const runCustomPrompt = useCallback(
    async (instructions: string, target: CustomPromptTarget) => {
      if (!issue || !promptContext) return;
      // Getting started, whether the free instruction is copied OR launched (MIN-147).
      // The launch is covered on the server side anyway; the signal is
      // idempotent, and this point covers the copy.
      handOffIssueApi(issue.id);
      if (target === "launch") {
        const identifier = issueIdentifier(projectKey, issue.number);
        composeAgentSession(
          `${tAgent("launchPrompt.head", { identifier })}\n\n${instructions}`,
          "custom"
        );
        return;
      }
      await navigator.clipboard.writeText(
        buildIssueCustomPrompt(
          {
            issue,
            projectId: issue.project_id,
            projectKey,
            categories: promptContext.categories,
            relations: promptContext.relations,
            resourceCount: issue.resource_count,
          },
          instructions
        )
      );
      toast.success(t("promptCopied"));
    },
    [issue, promptContext, projectKey, composeAgentSession, tAgent, t]
  );

  // “Copy prompt” and “Launch Numo agent”: two submenus, each
  // with the “plan” sheet (generate or verify, depending on the ticket) and
  // “Implement the ticket” (hook shared with the board cards).
  const agentActions = useAgentMenuActions({
    agentsEnabled,
    hasSession: hasAgentSession,
    hasPlan: issueHasPlan,
    onCopyPrompt: () => void copyPrompt(),
    onCopyPlanPrompt: () => void copyPlanPrompt(),
    onCopyVerifyPrompt: () => void copyVerifyPrompt(),
    onCopyCustomPrompt: () => setCustomTarget("copy"),
    onImplementWithAgent: startNewAgentSession,
    onWritePlanWithAgent: writePlanWithAgent,
    onVerifyWithAgent: verifyWithAgent,
    onCustomWithAgent: () => setCustomTarget("launch"),
    onOpenSession: () => setChatOpen(true),
  });

  // Field shortcuts (S/P/E/A/L/D/O) — active while the pointer hovers the panel
  // body; the picker opens at the cursor, in the key/value section. `d` maps to
  // the due-date picker here just like on board cards (voice dictation lives on
  // `v`, so nothing needs to be freed). ⇧P / ⇧A double the menu “⋯”, as on
  // maps; the hook never triggers them during an entry (title,
  // description, commentaire).
  // The “Custom” dialog suspends them: it covers the panel, and a key
  // hit in there should not open a picker on the ticket below.
  const { containerProps, menuState, closeMenu } = useIssueFieldShortcuts(
    open && !customTarget,
    {
      "shift+p": () => void copyPrompt(),
      "shift+a": launchAgent,
    }
  );

  // Apply a dictated patch: categories go through their own join-table
  // endpoint, everything else is one immediate issue update. Also sync the
  // local title state and remount the description editor so the new text shows.
  const applyDictated = (patch: IssueDraftPatch) => {
    if (!issue) return;
    const { category_ids, ...fields } = patch;
    const updates: IssueUpdateInput = {
      ...fields,
      ...(fields.description !== undefined
        ? { description: fields.description.trim() || null }
        : {}),
    };
    if (Object.keys(updates).length > 0) {
      void onUpdate(issue.id, updates).catch((err) =>
        toast.error((err as Error).message)
      );
    }
    // The dictation writes WHAT the panel displays: we note the version in passing,
    // otherwise the echo of our own patch would come back as a distant write
    // and would go up the editor a second time.
    if (fields.title !== undefined) {
      shownTitle.current = fields.title;
      titleEdited.current = false;
      setTitle(fields.title);
    }
    if (fields.description !== undefined) {
      shownDescription.current = fields.description.trim();
      descriptionEdited.current = false;
      setEditorKey((k) => k + 1);
    }
    if (category_ids) {
      void onSetCategories(issue.id, category_ids).catch((err) =>
        toast.error((err as Error).message)
      );
    }
  };

  // Voice editing (Numo): dictated commands become immediate field updates.
  // The draft fallbacks are for type-safety only — the mic lives inside the
  const mentions = useDescriptionMentions(issue?.project_id ?? null, members);

  // panel, so dictation never runs without an open issue.
  const {
    busy: numoBusy,
    onTranscript,
    reset: resetDictation,
  } = useIssueDictation({
    projectId: issue?.project_id ?? "",
    mode: "edit",
    getDraft: () => ({
      title: issue?.title ?? "",
      description: issue?.description ?? "",
      status: issue?.status ?? "backlog",
      priority: issue?.priority ?? "none",
      effort: issue?.effort ?? null,
      assignee_id: issue?.assignee_id ?? null,
      objective_id: issue?.objective_id ?? null,
      due_date: issue?.due_date ?? null,
      category_ids: issue?.category_ids ?? [],
    }),
    applyPatch: applyDictated,
  });

  // A different ticket (or a closed panel) = a fresh dictation session: drop
  // the history and abort any in-flight request.
  useEffect(() => {
    resetDictation();
  }, [issue?.id, resetDictation]); // eslint-disable-line react-hooks/exhaustive-deps

  // A take being transcribed (the audio is gone, the text is not
  // income): with the Numo suite, this is the window where closing loses dictation.
  const [transcribing, setTranscribing] = useState(false);
  const handleOpenChange = (next: boolean) => {
    // Dictation edits THIS ticket: the transcript, then the Numo patch, goes there
    // land. Closing them now would throw them away — we refuse, saying so (a
    // Escape without effect would pass for a failure).
    if (!next && (transcribing || numoBusy)) {
      toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
      return;
    }
    onOpenChange(next);
  };

  if (!issue) return null;

  const patch = async (updates: IssueUpdateInput) => {
    try {
      await onUpdate(issue.id, updates);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isChild = !!issue.parent_id;
  const parent = issue.parent_id
    ? allIssues.find((i) => i.id === issue.parent_id) ?? null
    : null;

  const commitTitle = () => {
    const trimmed = title.trim();
    // The field only lost focus, without a strike. If an agent has
    // renamed the ticket in the meantime, it is HIS title that is valid: ours is not
    // only a reflection, and recommitting it would undo its modification.
    if (!titleEdited.current) {
      if (trimmed !== issue.title) setTitle(issue.title);
      return;
    }
    titleEdited.current = false;
    if (trimmed && trimmed !== issue.title) {
      shownTitle.current = trimmed;
      void patch({ title: trimmed });
    } else if (!trimmed) setTitle(issue.title);
  };

  const commitDescription = (markdown: string) => {
    // Same caveat as for the title: a blur without typing does not rewrite anything.
    if (!descriptionEdited.current) return;
    descriptionEdited.current = false;
    const next = markdown.trim() || null;
    if (next === (issue.description ?? null)) return;
    shownDescription.current = next ?? "";
    void patch({ description: next });
  };

  const handleDelete = async () => {
    await onDelete(issue.id);
    toast.success(t("issueDeletedToast"));
    onOpenChange(false);
  };

  // Header “⋯” menu: share parity with right-click on a card
  // (prompt, agent, PR, cycle), plus the suppression that lived here before.
  const menuActions: ContextMenuAction[] = [
    ...agentActions,
    // “See the pull request” as soon as there is one, REGARDLESS OF ITS STATUS: one
    // Closed PR remains what happened on this ticket, and it's often her
    // that we are looking for. The header chip is silent about it.
    ...(agentsEnabled && pullRequest
      ? [
          {
            id: "open-pr",
            label: tAgent("viewPullRequest"),
            keywords: ["pull request", "pr", "review", "github", "gitlab", "merge"],
            icon: <GitPullRequest className="size-4" />,
            onSelect: openPr,
          },
        ]
      : []),
    ...buildCycleActions(issue),
    {
      id: "delete",
      label: tCommon("moveToTrash"),
      icon: <Trash2 className="size-4" />,
      separatorBefore: true,
      variant: "destructive",
      onSelect: () => setConfirmDelete(true),
    },
  ];

  return (
    <>
      {/* The open ticket names the tab — “MIN-42 · Fix Redirect”.
          Neither the page nor a layout can do this: the ticket lives in a
          search parameter, not in a route. */}
      {open && (
        <DocumentTitle
          title={`${issueIdentifier(projectKey, issue.number)} · ${issue.title} · ${siteName}`}
        />
      )}
      <SidePanel open={open} onOpenChange={handleOpenChange}>
        <SidePanelContent
          onInteractOutside={keepOverlayOpenForPopper}
          // Radix moves focus to the first tabbable element when the panel
          // opens; here that's the Dictate button, whose tooltip then pops up.
          // Suppress the open-autofocus so nothing is focused on open.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header: identifier · agent state · dictate · more · close */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-3">
            <div className="flex min-w-0 items-center gap-1">
              <SidePanelTitle asChild>
                <span className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
                  <IntegrationIndicator issue={issue} iconClassName="size-4" />
                  <RemoteIssueIndicator issue={issue} iconClassName="size-4" />
                  {parent && (
                    <button
                      type="button"
                      onClick={() => onOpenIssue(parent.id)}
                      aria-label={t("openParentAria", {
                        id: issueIdentifier(projectKey, parent.number),
                      })}
                      className="rounded font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none"
                    >
                      {issueIdentifier(projectKey, parent.number)}
                    </button>
                  )}
                  {/* As on the map: hovering over “› MIN-42” names the relationship
                      that the chevron alone suggests. */}
                  {parent ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-1.5">
                          <ChevronRight
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          {issueIdentifier(projectKey, issue.number)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("subIssueOf", {
                          id: issueIdentifier(projectKey, parent.number),
                        })}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    issueIdentifier(projectKey, issue.number)
                  )}
                </span>
              </SidePanelTitle>
              {resolvedRelations.length > 0 && (
                <RelationChips
                  relations={resolvedRelations}
                  projectKey={projectKey}
                  onOpen={onOpenIssue}
                  max={1}
                  className="font-mono text-xs text-muted-foreground"
                />
              )}
              {/* Code Agent: the only state that deserves the header (at work,
                  or a PR to reread) — the rest is in the “⋯” menu. */}
              {agentsEnabled && (
                <IssueAgentChip
                  working={agentWorking}
                  pr={pullRequest}
                  onOpenConversation={() => setChatOpen(true)}
                  onOpenPr={openPr}
                />
              )}
              {/* Voice editing — Numo turns dictated commands into field updates */}
              {numoBusy ? (
                <>
                  <span
                    className="inline-flex size-8 shrink-0 items-center justify-center"
                    aria-hidden
                  >
                    <NumoIcon
                      state="thinking"
                      className="size-5 text-primary animate-in fade-in duration-300"
                    />
                  </span>
                  <span className="sr-only" role="status">
                    {t("numoUpdating")}
                  </span>
                </>
              ) : (
                <DictateButton
                  onTranscription={onTranscript}
                  tooltipLabel={t("dictateEditTooltip")}
                  shortcutKey="mod+shift+d"
                  onProcessingChange={setTranscribing}
                />
              )}
            </div>
            <div className="-mr-1.5 flex items-center gap-0.5">
              <IssueActionsMenu
                actions={menuActions}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("moreActionsAriaLabel")}
                    className="rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal />
                  </Button>
                }
              />
              <SidePanelClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tCommon("close")}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X />
                </Button>
              </SidePanelClose>
            </div>
          </div>

          <SidePanelBody className="flex flex-col gap-4 pt-0" {...containerProps}>
            <AutoTextarea
              ref={titleRef}
              value={title}
              onChange={(e) => {
                titleEdited.current = true;
                setTitle(e.target.value);
              }}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="w-full shrink-0 overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
              placeholder={t("titlePlaceholder")}
            />

            {/* The automation chain, when there is one (MIN-147). Under the
                title and not in the header: it is not a one-line report,
                it’s a work in progress with two gestures to offer. She
                hides by itself when the chain is finished.
                NOT behind `agentsEnabled`: a string that EXISTS is a fact,
                and the case which most deserves to be shown is precisely that
                of a chain stopped FOR FAULT of linked deposit. */}
            <ChainStatusBar issueId={issue.id} />

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "description" | "plan")}
            >
              <TabsList variant="line" className={TAB_LIST_DENSE}>
                <TabsTrigger value="description" className={TAB_TRIGGER_DENSE}>
                  {tPlan("tabDescription")}
                </TabsTrigger>
                <TabsTrigger value="plan" className={cn(TAB_TRIGGER_DENSE, "gap-1.5")}>
                  {tPlan("tabPlan")}
                  {progress.total > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {progress.done}/{progress.total}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="mt-4">
                <IssuePlan
                  key={issue.id}
                  plan={issue.plan}
                  onCommit={(plan) => void patch({ plan })}
                  // Numo only appears where it can work: a linked repository
                  // (the same door as ⇧A / the “⋯” menu). The prompts
                  // Copyable ones work with any external agent.
                  onWriteWithAgent={agentsEnabled ? writePlanWithAgent : undefined}
                  onCopyPrompt={() => void copyPlanPrompt()}
                  onImplementWithAgent={
                    agentsEnabled ? startNewAgentSession : undefined
                  }
                  onCopyImplementPrompt={() => void copyPrompt()}
                  onVerifyWithAgent={agentsEnabled ? verifyWithAgent : undefined}
                  onCopyVerifyPrompt={() => void copyVerifyPrompt()}
                />
              </TabsContent>

              <TabsContent value="description" className="mt-4 flex flex-col gap-6">
                {/* The container serves as a focus marker: as long as the cursor is
                    IN the editor, distant writing does not bring it up — and
                    when it comes out, the publisher takes the version in
                    waiting (the blur doesn't change anything else: without typing, nothing
                    is not committed, so nothing would retrigger the effect). */}
                <div
                  ref={descriptionRef}
                  onBlur={() => {
                    const description = issue.description ?? "";
                    if (
                      descriptionEdited.current ||
                      description === shownDescription.current
                    ) {
                      return;
                    }
                    shownDescription.current = description;
                    setEditorKey((k) => k + 1);
                  }}
                >
                  <MarkdownEditor
                    key={`${issue.id}:${editorKey}`}
                    mentions={mentions}
                    value={issue.description ?? ""}
                    onCommit={commitDescription}
                    onEdit={() => {
                      descriptionEdited.current = true;
                    }}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </div>

                {/* Key/value properties — borderless, like the issue cards.
                    Attachments and relations are rows of this table too: each
                    puts its control on the value side and lists its content
                    right under the row, so they read as properties of the
                    ticket rather than sections of their own. */}
                <div className="flex flex-col">
                  <PropertyRow label={tField("status")}>
                    <StatusValue
                      value={issue.status}
                      onChange={(status) => void patch({ status })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("priority")}>
                    <PriorityValue
                      value={issue.priority}
                      onChange={(priority) => void patch({ priority })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("effort")}>
                    <EffortValue
                      value={issue.effort}
                      onChange={(effort) => void patch({ effort })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("assignee")}>
                    <AssigneeValue
                      value={issue.assignee_id}
                      members={members}
                      onChange={(assignee_id) => void patch({ assignee_id })}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("categories")}>
                    <CategoryValue
                      categories={categories}
                      projectId={issue.project_id}
                      value={issue.category_ids}
                      onChange={(ids) => {
                        void onSetCategories(issue.id, ids).catch((err) =>
                          toast.error((err as Error).message)
                        );
                      }}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("dueDate")}>
                    <DueDateValue
                      value={issue.due_date}
                      onChange={(due_date) => void patch({ due_date })}
                      recurrence={issue.recurrence}
                      onRecurrenceChange={(next) => void patch(next)}
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("objectiveLinked")}>
                    <ObjectiveValue
                      value={issue.objective_id}
                      objectives={objectives}
                      projectId={issue.project_id}
                      onChange={(objective_id) => void patch({ objective_id })}
                    />
                  </PropertyRow>

                  <IssueResourcesSection
                    issueId={issue.id}
                    projectId={issue.project_id}
                  />

                  <RelationsSection
                    issue={issue}
                    relations={resolvedRelations}
                    allIssues={allIssues}
                    projectKey={projectKey}
                    onOpenIssue={onOpenIssue}
                    onAddRelation={onAddRelation}
                    onRemoveRelation={onRemoveRelation}
                  />

                  {githubMetadata && (
                    <div className="border-t border-border/60 px-3 py-3 text-sm">
                      <p className="font-medium">{t("githubMetadataTitle")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("githubMetadataHint")}
                      </p>
                      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                        {typeof githubMetadata.author_login === "string" && (
                          <>
                            <dt>{t("githubAuthor")}</dt>
                            <dd className="text-foreground">@{githubMetadata.author_login}</dd>
                          </>
                        )}
                        {typeof githubMetadata.state_reason === "string" && (
                          <>
                            <dt>{t("githubStateReason")}</dt>
                            <dd className="text-foreground">{githubMetadata.state_reason}</dd>
                          </>
                        )}
                        {typeof githubMetadata.locked === "boolean" && (
                          <>
                            <dt>{t("githubLocked")}</dt>
                            <dd className="text-foreground">
                              {githubMetadata.locked ? t("githubYes") : t("githubNo")}
                            </dd>
                          </>
                        )}
                        {isGithubMetadataObject(githubMetadata.milestone) && (
                          <>
                            <dt>{t("githubMilestone")}</dt>
                            <dd className="text-foreground">
                              {githubMilestoneValue(githubMetadata.milestone)}
                            </dd>
                          </>
                        )}
                      </dl>
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          {t("githubRawMetadata")}
                        </summary>
                        <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(githubMetadata, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>

                {!isChild && (
                  <SubIssuesSection
                    issue={issue}
                    allIssues={allIssues}
                    projectKey={projectKey}
                    onOpenIssue={onOpenIssue}
                    onCreate={onCreate}
                  />
                )}

                <IssueActivity
                  items={items}
                  ctx={{
                    members,
                    objectives,
                    categories,
                    issues: allIssues,
                    projectKey,
                  }}
                  currentUserId={user?.id ?? null}
                  projectId={issue.project_id}
                  onReply={(parentId, body, mentions, attachments) =>
                    addComment(body, mentions, parentId, attachments)
                  }
                  onEditComment={updateComment}
                  onDeleteComment={deleteComment}
                  onDeleteAttachment={deleteAttachment}
                />
              </TabsContent>
            </Tabs>
          </SidePanelBody>

          <IssueShortcutMenu
            state={menuState}
            onClose={closeMenu}
            issue={issue}
            members={members}
            categories={categories}
            objectives={objectives}
            onUpdate={(updates) => void patch(updates)}
            onSetCategories={(ids) =>
              void onSetCategories(issue.id, ids).catch((err) =>
                toast.error((err as Error).message)
              )
            }
          />

          <SidePanelFooter className="border-t-0 pt-3 sm:flex-row">
            <CommentComposer
              members={members}
              projectId={issue.project_id}
              onSubmit={(body, mentions, attachments) =>
                addComment(body, mentions, null, attachments)
              }
            />
          </SidePanelFooter>

          {/* Numo takes over the dictation: the border highlights the edge of the panel
            while working — same signal as the Numo “thinking” icon
            which replaces the mic in the header. */}
          <AgentBeamOverlay active={numoBusy} />
        </SidePanelContent>
      </SidePanel>

      {/* Hot restart of the conversation, ABOVE the panel: opens the
          last run and gives access to the ticket's run history. Rise
          only when a run exists — without `initialRunId` the modal
          would fall back on a composer, which “New session” already does. */}
      {latestRun && (
        <AgentChatModal
          open={chatOpen}
          onOpenChange={setChatOpen}
          issueId={issue.id}
          projectId={issue.project_id}
          issueIdentifier={issueIdentifier(projectKey, issue.number)}
          initialRunId={latestRun.id}
        />
      )}

      <CustomPromptDialog
        target={customTarget}
        onOpenChange={(open) => !open && setCustomTarget(null)}
        onSubmit={(instructions, target) => {
          void runCustomPrompt(instructions, target);
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { days: TRASH_RETENTION_DAYS })}
        confirmLabel={tCommon("moveToTrash")}
        cancelLabel={tCommon("cancel")}
        onConfirm={handleDelete}
      />
    </>
  );
}

function isGithubMetadataObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function githubMilestoneValue(milestone: Record<string, unknown>): string {
  const title = typeof milestone.title === "string" ? milestone.title : null;
  const dueOn = typeof milestone.due_on === "string" ? milestone.due_on : null;
  return [title, dueOn].filter(Boolean).join(" · ") || "—";
}
