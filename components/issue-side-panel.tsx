"use client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { useAppTabDeparture } from "@/lib/app-tabs-context";
import { useIssuePanelTab } from "@/lib/use-issue-panel-tab";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppRouter } from "@/lib/use-app-router";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRetainedWhileClosing } from "@/lib/use-retained-while-closing";
import { SidePanel, SidePanelBody, SidePanelClose, SidePanelContent, SidePanelFooter, SidePanelTitle } from "@/components/ui/side-panel";
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
import { IssueParentMenu } from "@/components/issue-parent-menu";
import { RelationsSection } from "@/components/relations-section";
import { IssuePrChip } from "@/components/issue-pr-chip";
import { useAgentMenuActions } from "@/components/agent/use-agent-menu-actions";
import { CustomPromptDialog } from "@/components/agent/custom-prompt-dialog";
import { IssueActionsMenu } from "@/components/issue-context-menu";
import { useIssueMenuActions } from "@/components/use-issue-menu-actions";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { RelationTargetPicker } from "@/components/relation-target-picker";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { useIssuePullRequestQuery } from "@/lib/use-agent-runs";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import {
  buildIssueCommentsPrompt,
  buildIssueCustomPrompt,
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
} from "@/lib/issue-prompt";
import {
  loadOneIssuePromptContext,
  prefetchIssuePromptContext,
} from "@/lib/issue-prompt-context";
import { useMyCycleQuery } from "@/lib/use-my-cycle-query";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { RelationChips, type ChipRelation } from "@/components/relation-chips";
import { resolveDisplayRelationsByIssue } from "@/lib/relation-constants";
import {
  IssueShortcutMenu,
  RELATION_SHORTCUT_KEY,
  useIssueFieldShortcuts,
} from "@/components/issue-field-shortcuts";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import { CommentFollowUpButton } from "@/components/comment-follow-up-button";
import { commentFollowUp } from "@/lib/comment-follow-up";
import { IssueResourcesSection } from "@/components/issue-resources-section";
import { IssuePlan } from "@/components/issue-plan";
// Deferred editor: keeps tiptap (~1.5 MB) out of the board routes that mount
// this panel — see components/editor/document-editor-lazy.tsx. Warmed from idle time below.
import {
  DeferredDocumentEditor,
  useIdleDocumentEditorPreload,
} from "@/components/editor/document-editor-lazy";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useResourceMentions } from "@/lib/use-resource-mentions";
import { useIssueResources } from "@/lib/use-issue-resources";
import { useRichDocument } from "@/lib/use-rich-document";
import { useDescriptionCollaboration } from "@/lib/use-description-collaboration";
import type { JSONContent } from "@tiptap/core";
import { useArrowField } from "@/lib/use-arrow-field";
import { useTitleBodyLink } from "@/lib/use-title-body-link";
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
import { useIssuePanelActions } from "@/lib/issue-panel-context";
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
  RelationEndpointType,
} from "@/lib/types";

export function IssueSidePanel({
  issue: liveIssue,
  open: requestedOpen,
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
    targetId: string,
    kinds?: {
      sourceType?: RelationEndpointType;
      targetType?: RelationEndpointType;
    }
  ) => void;
  onRemoveRelation: (relationId: string) => void;
  /** Tab to show when the panel (re)opens on a new issue. */
  initialTab?: "description" | "plan";
}) {
  // Callers close the panel by clearing the issue: keep showing it while the
  // panel slides out, closed (MIN-774).
  const issue = useRetainedWhileClosing(liveIssue);
  const open = requestedOpen && liveIssue != null;
  const { siteName } = useRuntimeConfig();
  const { user } = useAuth();
  const router = useAppRouter();
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tPlan = useTranslations("Plan");
  const { openIssue: openGlobalIssue } = useIssuePanelActions();
  // Project readers (MIN-693) see the ticket without editing controls; the
  // server rejects their writes regardless.
  const { canWrite, canComment } = useProjectCapabilities(issue?.project_id ?? null);
  const readOnly = !canWrite;
  // The panel mounts with its board: warm the editor chunk once the page has
  // painted, so opening a ticket never shows the loading fallback.
  useIdleDocumentEditorPreload();
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const buildIssueMenuActions = useIssueMenuActions();
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [relationType, setRelationType] = useState<IssueRelationType | null>(null);
  useEffect(() => setRelationType(null), [issue?.id, open]);
  // The Relations row's add popover, opened by its button or by R.
  const [relationsOpen, setRelationsOpen] = useState(false);
  useEffect(() => setRelationsOpen(false), [issue?.id, open]);
  const [tab, setTab] = useIssuePanelTab(issue?.id ?? null, initialTab);
  // Remount the description editor when the description is rewritten under it
  // (dictation, or distant writing) — it only reads `value` during editing and
  // ne commite qu'au blur.
  const [editorKey, setEditorKey] = useState(0);
  // The description's editor document (MIN-728): what Markdown cannot carry —
  // block identities, colors, pills. `undefined` while it loads.
  // The live description (MIN-728): every editor of this issue shares one
  // document, and typing travels as steps instead of Markdown commits.
  const tPages = useTranslations("Pages");
  const liveReadyRef = useRef(false);
  const liveDescription = useDescriptionCollaboration({
    kind: "issue",
    id: issue?.id ?? null,
    userId: user?.id ?? null,
    enabled: open && !!issue,
    members,
    onRefused: () => toast.error(tPages("liveEditRefused")),
    onFatal: () => toast.error(tPages("saveFailed")),
  });
  const liveReady = liveDescription.status === "ready" && !!liveDescription.collaboration;
  // The plan is a live document of its own, opened while its tab shows.
  const livePlan = useDescriptionCollaboration({
    kind: "plan",
    id: issue?.id ?? null,
    userId: user?.id ?? null,
    enabled: open && !!issue && tab === "plan",
    members,
    onRefused: () => toast.error(tPages("liveEditRefused")),
    onFatal: () => toast.error(tPages("saveFailed")),
  });
  liveReadyRef.current = liveReady;
  // Without a live session (an older server, a failed read), the editor
  // saves Markdown with its document, as before.
  const {
    document: descriptionDocument,
    remember: rememberDescriptionDocument,
  } = useRichDocument("issue", issue?.id, {
    enabled: open && liveDescription.status === "unavailable",
  });
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
  // “->” becomes “→” while typing, like in the body editor.
  const arrowTitle = useArrowField(titleRef);
  const descriptionRef = useRef<HTMLDivElement>(null);
  // Title and description read as one text on the keyboard (MIN-756).
  const titleBody = useTitleBodyLink(titleRef, descriptionRef);
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
  /** Live markdown of the description editor, kept current on every edit (and
      re-seeded on each mount/remount of the surface). Lets a close, a tab
      switch or a window blur commit what is on screen even though the
      editor's own blur never ran. */
  const latestDescription = useRef("");
  /** The editor document of `latestDescription`, sent with it. */
  const latestDescriptionDocument = useRef<JSONContent | null>(null);
  /** Raised when a description commit just went out: the container's blur —
      which always follows the editor's in the same event — must not remount
      the surface with the stale reflection the prop still carries. One-shot:
      consumed by the very next container blur. */
  const justCommitted = useRef(false);
  // “Custom”: the free instructions dialog that copies the prompt.
  const [customPromptOpen, setCustomPromptOpen] = useState(false);

  const { items, readState, retryRead, addComment, updateComment, deleteComment, deleteAttachment, renameAttachment } =
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
        : null,
      issue?.project_id ?? null,
      open,
    );

  // The PR of this ticket, served on its own route: the panel also opens where
  // the board's PR provider does not exist (Pull requests page, feedback
  // board). A ticket can carry one opened by anyone.
  const pullRequest = useIssuePullRequestQuery(issue?.id ?? null);

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
      latestDescription.current = description;
      latestDescriptionDocument.current = null;
      justCommitted.current = false;
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
    // lever than dictation. So never while writing there. A live description
    // receives remote writes as steps and is never remounted for them.
    if (
      !liveReadyRef.current &&
      description !== shownDescription.current &&
      !descriptionEdited.current &&
      !descriptionRef.current?.contains(document.activeElement)
    ) {
      shownDescription.current = description;
      latestDescription.current = description;
      latestDescriptionDocument.current = null;
      setEditorKey((k) => k + 1);
    }
  }, [issue?.id, issue?.title, issue?.description]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => planProgress(issue?.plan), [issue?.plan]);
  // A plan already exists → the “plan” entries (menu ⋯, Plan tab, prompt
  // copied, Numo agent) toggle from “generate” to “verify”.
  const issueHasPlan = hasPlanTasks(issue?.plan);

  // This issue's relations, resolved to the display shape (with the other
  // issue's number) and priority-sorted. Numbers come from allIssues so a
  // filtered-out target still resolves; OBJECTIVE ends (MIN-513) carry their
  // name instead — they have no ticket number.
  const resolvedRelations = useMemo<ChipRelation[]>(() => {
    if (!issue) return [];
    const byId = new Map(allIssues.map((i) => [i.id, i]));
    const objectiveById = new Map(objectives.map((o) => [o.id, o]));
    return resolveDisplayRelationsByIssue(relations, byId, objectiveById).get(issue.id) ?? [];
  }, [issue, relations, allIssues, objectives]); // eslint-disable-line react-hooks/exhaustive-deps

  // `?pr=`: the link works for any PR, including a hand-attached one (MIN-163).
  const openPr = useCallback(() => {
    if (pullRequest) router.push(`/pull-requests?pr=${pullRequest.prId}`);
  }, [pullRequest, router]);

  // Context shared by the two copyable prompts (work on the ticket,
  // write your plan): resolved relationships and category names.
  const promptContext = useMemo(() => {
    if (!issue) return null;
    const titleById = new Map(allIssues.map((i) => [i.id, i.title]));
    return {
      relations: resolvedRelations.map((r) =>
        r.otherType === "objective"
          ? {
              type: r.relation,
              objective: true,
              identifier: "",
              title: r.otherName ?? "",
            }
          : {
              type: r.relation,
              objective: false,
              identifier: issueIdentifier(projectKey, r.otherNumber ?? 0),
              title: titleById.get(r.otherId) ?? "",
            }
      ),
      // Category names (IDs live on the issue, names in `categories`).
      categories: issue.category_ids
        .map((cid) => categories.find((c) => c.id === cid)?.name)
        .filter((name): name is string => !!name),
    };
  }, [issue, allIssues, resolvedRelations, categories, projectKey]);

  // An open panel offers every copy action: warm their forge context so a
  // copy never waits on it (MIN-723).
  const promptIssueId = issue?.id;
  useEffect(() => {
    if (promptIssueId) prefetchIssuePromptContext([promptIssueId]);
  }, [promptIssueId]);

  const copyPrompt = useCallback(async () => {
    if (!issue || !promptContext) return;
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
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssuePrompt({
        issue: promptIssue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        resourceCount: issue.resource_count,
        ...forge,
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
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssuePlanPrompt({
        issue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        resourceCount: issue.resource_count,
        ...forge,
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
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssueVerifyPrompt({
        issue,
        projectId: issue.project_id,
        projectKey,
        categories: promptContext.categories,
        relations: promptContext.relations,
        resourceCount: issue.resource_count,
        ...forge,
      })
    );
    toast.success(t("verifyPromptCopied"));
  }, [issue, promptContext, projectKey, t]);

  // New comments since the ticket's MCP agent last commented (MIN-801):
  // replies count too, since they are written to it as well.
  const followUp = useMemo(
    () => commentFollowUp(items.flatMap((item) =>
      item.kind === "comment" ? [item.comment, ...item.replies] : [])),
    [items],
  );

  // “Copy prompt for new comments”: the agent reads them through the MCP, the
  // prompt only says how many and since when. No automatic start: the ticket
  // is already under way.
  const copyCommentsPrompt = useCallback(async () => {
    if (!issue || !promptContext || !followUp) return;
    const forge = await loadOneIssuePromptContext(issue.id);
    await navigator.clipboard.writeText(
      buildIssueCommentsPrompt(
        {
          issue,
          projectId: issue.project_id,
          projectKey,
          categories: promptContext.categories,
          relations: promptContext.relations,
          resourceCount: issue.resource_count,
          ...forge,
        },
        followUp
      )
    );
    toast.success(t("commentsPromptCopied"));
  }, [issue, promptContext, followUp, projectKey, t]);

  // “Custom”: the instruction entered in the dialog replaces the instruction
  // ready made — the context of the ticket remains provided by minddy (block
  // <issue> of the copied prompt). No automatic start: we do not know if this
  // instruction is work.
  const runCustomPrompt = useCallback(
    async (instructions: string) => {
      if (!issue || !promptContext) return;
      const forge = await loadOneIssuePromptContext(issue.id);
      await navigator.clipboard.writeText(
        buildIssueCustomPrompt(
          {
            issue,
            projectId: issue.project_id,
            projectKey,
            categories: promptContext.categories,
            relations: promptContext.relations,
            resourceCount: issue.resource_count,
            ...forge,
          },
          instructions
        )
      );
      toast.success(t("promptCopied"));
    },
    [issue, promptContext, projectKey, t]
  );

  // “Copy as prompt”: one submenu with the “plan” leaf (generate or verify,
  // depending on the ticket) and “Implement the ticket” (hook shared with the
  // board cards).
  const agentActions = useAgentMenuActions({
    hasPlan: issueHasPlan,
    onCopyPrompt: () => void copyPrompt(),
    onCopyPlanPrompt: () => void copyPlanPrompt(),
    onCopyVerifyPrompt: () => void copyVerifyPrompt(),
    onCopyCustomPrompt: () => setCustomPromptOpen(true),
    onCopyCommentsPrompt: followUp ? () => void copyCommentsPrompt() : undefined,
  });

  // Field shortcuts (S/P/E/A/L/D/O) — active while the pointer hovers the panel
  // body; the picker opens at the cursor, in the key/value section. `d` maps to
  // the due-date picker here just like on board cards (voice dictation lives on
  // `v`, so nothing needs to be freed). ⇧P doubles the menu “⋯”, as on
  // cards; the hook never triggers them during an entry (title,
  // description, commentaire).
  // The “Custom” dialog suspends them: it covers the panel, and a key
  // hit in there should not open a picker on the ticket below.
  const { containerProps, menuState, openField, closeMenu } = useIssueFieldShortcuts(
    open && !customPromptOpen && canWrite,
    {
      "shift+p": () => void copyPrompt(),
      // R opens the Relations row's own popover, not a menu at the cursor:
      // the panel already shows where relations are added (MIN-749).
      [RELATION_SHORTCUT_KEY]: () => setRelationsOpen(true),
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
      latestDescription.current = fields.description.trim();
      descriptionEdited.current = false;
      setEditorKey((k) => k + 1);
    }
    if (category_ids) {
      void onSetCategories(issue.id, category_ids).catch((err) =>
        toast.error((err as Error).message)
      );
    }
  };

  const openMentionedIssue = useCallback(
    (projectId: string, issueId: string) => {
      if (projectId === issue?.project_id) {
        onOpenIssue(issueId);
      } else {
        openGlobalIssue(projectId, issueId);
      }
    },
    [issue?.project_id, onOpenIssue, openGlobalIssue],
  );
  // The description and the plan can cite the ticket's own resources, and
  // only those (MIN-742). Comments cite their own (components/issue-timeline).
  const { resources: issueResources } = useIssueResources(issue?.id ?? null);
  const mentions = useResourceMentions(
    useDescriptionMentions(
      issue?.project_id ?? null,
      members,
      openMentionedIssue,
    ),
    issueResources,
  );

  // Voice editing (Numo): dictated commands become immediate field updates.
  // The draft fallbacks are for type-safety only — the mic lives inside the
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
  const pendingWrites = useRef(new Set<Promise<boolean>>());
  useAppTabDeparture(async () => {
    if (!open) return true;
    if (transcribing || numoBusy) {
      toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
      return false;
    }
    // A field that has not blurred yet still holds uncommitted text: flush it
    // rather than refuse the departure — the text is the user's, committing
    // it is what they intend (refusing used to wedge the tab switch instead).
    commitPendingEditsRef.current();
    // A live description's typing must have reached the server (MIN-728).
    const [saved, liveSaved] = await Promise.all([
      Promise.all(pendingWrites.current),
      liveDescription.flush(),
      livePlan.flush(),
    ]).then(([written, description, plan]) => [written, description && plan] as const);
    return saved.every(Boolean) && liveSaved && !titleEdited.current && !descriptionEdited.current;
  });
  const handleOpenChange = (next: boolean) => {
    // Dictation edits THIS ticket: the transcript, then the Numo patch, goes there
    // land. Closing them now would throw them away — we refuse, saying so (a
    // Escape without effect would pass for a failure).
    if (!next && (transcribing || numoBusy)) {
      toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
      return;
    }
    // Closing must not discard what is on screen: Escape, ✕ and Radix's
    // outside dismissal can all run without the editor's blur ever firing.
    // Commit first — the flags clear, so remote adoption resumes cleanly.
    if (!next) commitPendingEditsRef.current();
    onOpenChange(next);
  };

  // ── Editable fields: write + commit ─────────────────────────────────────
  // Defined unconditionally (before the panel's early return) so the close
  // handler and the window-blur listener below can always reach them; every
  // one of them no-ops without an open ticket.

  const patch = async (updates: IssueUpdateInput) => {
    if (!issue) return false;
    const write = onUpdate(issue.id, updates).then(() => true, (err) => {
      // Keep failed text edits recoverable instead of accepting a tab departure.
      if (updates.title !== undefined) titleEdited.current = true;
      if (updates.description !== undefined) descriptionEdited.current = true;
      toast.error((err as Error).message);
      return false;
    });
    pendingWrites.current.add(write);
    try { return await write; }
    finally { pendingWrites.current.delete(write); }
  };

  const commitTitle = () => {
    if (!issue) return;
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

  const commitDescription = (markdown: string, content?: JSONContent | null) => {
    // Same caveat as for the title: a blur without typing does not rewrite anything.
    if (!issue || !descriptionEdited.current) return;
    descriptionEdited.current = false;
    const next = markdown.trim() || null;
    if (next === (issue.description ?? null)) return;
    shownDescription.current = next ?? "";
    justCommitted.current = true;
    // With its document, the server derives the Markdown from it (MIN-728).
    if (next && content) {
      rememberDescriptionDocument(content);
      void patch({ description: next, description_doc: content });
    } else {
      void patch({ description: next });
    }
  };

  /** Commit the description that is on screen, whether or not the editor ever
      blurred (Escape, ✕, tab switch, window blur all skip its blur). */
  const commitDescriptionNow = () => {
    commitDescription(latestDescription.current, latestDescriptionDocument.current);
  };

  /** Flush both editable fields. Clears the edited flags, so remote adoption
      (MIN-89) resumes immediately after. */
  const commitPendingEdits = () => {
    commitTitle();
    commitDescriptionNow();
  };
  const commitPendingEditsRef = useRef(commitPendingEdits);
  commitPendingEditsRef.current = commitPendingEdits;

  // Leaving the window (⌘-tab, another application, a native menu) blurs
  // nothing inside the page: an in-progress edit would linger uncommitted, and
  // worse, keep the edited flags raised — which suppresses remote adoption
  // (MIN-89), so Numo's or a teammate's rewrite stayed invisible until the
  // panel was reopened. Commit on the way out; real time then flows again.
  const dictationInFlightRef = useRef(false);
  dictationInFlightRef.current = transcribing || numoBusy;
  useEffect(() => {
    const commitOnWindowBlur = () => {
      if (dictationInFlightRef.current) return;
      commitPendingEditsRef.current();
    };
    window.addEventListener("blur", commitOnWindowBlur);
    return () => window.removeEventListener("blur", commitOnWindowBlur);
  }, []);

  // Match the card's relation targets: exclude self and direct links of the
  // selected type; closed tickets stay eligible (sorted last), and inherited
  // objective links remain eligible.
  const relationCandidates = useMemo(() => {
    if (!issue || !relationType) return [];
    const linked = new Set(resolvedRelations
      .filter((r) => !r.inheritedObjectiveId && r.relation === relationType && r.otherType !== "objective")
      .map((r) => r.otherId));
    return allIssues.filter((target) => target.project_id === issue.project_id &&
      target.id !== issue.id && !linked.has(target.id));
  }, [issue, relationType, resolvedRelations, allIssues]);
  const relationObjectiveCandidates = useMemo(() => {
    if (!issue || !relationType) return [];
    const linked = new Set(resolvedRelations
      .filter((r) => !r.inheritedObjectiveId && r.relation === relationType && r.otherType === "objective")
      .map((r) => r.otherId));
    return objectives.filter((target) => target.project_id === issue.project_id &&
      !linked.has(target.id) && target.status !== "done" && target.status !== "canceled");
  }, [issue, relationType, resolvedRelations, objectives]);

  if (!issue) return null;

  const isChild = !!issue.parent_id;
  const parent = issue.parent_id
    ? allIssues.find((i) => i.id === issue.parent_id) ?? null
    : null;

  const handleDelete = async () => {
    await onDelete(issue.id);
    toast.success(t("issueDeletedToast"));
    onOpenChange(false);
  };

  const menuActions = buildIssueMenuActions({
    issue,
    projectKey,
    agentActions,
    pr: pullRequest,
    hasObjectives: objectives.length > 0,
    onSelectRelation: setRelationType,
    onOpenField: (field) => {
      if (menuPointerRef.current) openField(field, menuPointerRef.current);
    },
    extraActions: buildCycleActions(issue),
    onDelete: () => setConfirmDelete(true),
    readOnly,
  });

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
          {/* Header: parent → identifier · agent state · dictate · more · close */}
          <div data-mobile-sheet-header className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-3">
            <div className="flex min-w-0 items-center gap-1">
              <IssueParentMenu
                key={issue.id}
                parentIdentifier={parent ? issueIdentifier(projectKey, parent.number) : null}
                onOpenParent={() => parent && onOpenIssue(parent.id)}
                onUnlink={readOnly ? undefined : () => patch({ parent_id: null })}
              />
              <SidePanelTitle asChild>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-lg font-semibold tracking-tight">
                  <IntegrationIndicator issue={issue} iconClassName="size-4" />
                  <RemoteIssueIndicator issue={issue} iconClassName="size-4" />
                  {issueIdentifier(projectKey, issue.number)}
                </span>
              </SidePanelTitle>
              {/* A PR to reread: the only state that deserves the header —
                  the rest is in the “⋯” menu. */}
              <IssuePrChip pr={pullRequest} onOpenPr={openPr} />
              {/* Voice editing — Numo turns dictated commands into field updates */}
              {readOnly ? null : numoBusy ? (
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
                  context="issue_form"
                  onTranscription={onTranscript}
                  tooltipLabel={t("dictateEditTooltip")}
                  shortcutKey="mod+shift+d"
                  onProcessingChange={setTranscribing}
                />
              )}
            </div>
            <div data-mobile-sheet-header-actions className="-mr-1.5 flex items-center gap-0.5">
              {menuActions.length > 0 && (
              <IssueActionsMenu
                key={issue.id}
                actions={menuActions}
                searchable
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) return;
                  const rect = moreButtonRef.current?.getBoundingClientRect();
                  if (rect) menuPointerRef.current = { x: rect.left, y: rect.bottom };
                }}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("moreActionsAriaLabel")}
                    ref={moreButtonRef}
                    className="rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} />
                  </Button>
                }
              />
              )}
              <SidePanelClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tCommon("close")}
                  shortcut={["Esc"]}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon icon={Cancel01Icon} />
                </Button>
              </SidePanelClose>
            </div>
          </div>

          {resolvedRelations.some((r) => !r.resolved) && (
            <div className="flex flex-wrap items-center gap-2 px-6 pb-3 text-xs text-muted-foreground">
              <RelationChips relations={resolvedRelations} projectKey={projectKey} onOpen={onOpenIssue}
                onOpenObjective={(id) => router.push(`/projects/${issue.project_id}/objectives?open=${id}`)} />
            </div>
          )}

          <SidePanelBody className="flex flex-col gap-4 pt-0" {...containerProps}>
            <AutoTextarea
              ref={arrowTitle.ref}
              value={title}
              readOnly={readOnly}
              onChange={(e) => {
                titleEdited.current = true;
                setTitle(arrowTitle.read(e));
              }}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                titleBody.onTitleKeyDown(e);
              }}
              className="w-full shrink-0 title-field bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
              placeholder={t("titlePlaceholder")}
            />

            {/* The automation chain, when there is one (MIN-147). Under the
                title and not in the header: it is not a one-line report,
                it’s a work in progress with two gestures to offer. She
                hides by itself when the chain is finished.
                NOT behind `agentsEnabled`: a string that EXISTS is a fact,
                and the case which most deserves to be shown is precisely that
                of a chain stopped FOR FAULT of linked deposit. */}


            <Tabs
              value={tab}
              onValueChange={(v) => {
                // Radix activates a tab on mousedown — BEFORE the browser moves
                // focus, so the description editor unmounts without its blur
                // ever firing. Commit what is on screen first.
                if (v !== tab) commitDescriptionNow();
                setTab(v as "description" | "plan");
              }}
            >
              <TabsList variant="line" className={cn(TAB_LIST_DENSE, "-translate-x-3")}>
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
                  issueId={issue.id}
                  projectId={issue.project_id}
                  plan={issue.plan}
                  live={livePlan}
                  mentions={mentions}
                  readOnly={readOnly}
                  onCommit={(plan) => void patch({ plan })}
                  // Copyable prompts serve the user's own coding agent.
                  onCopyPrompt={() => void copyPlanPrompt()}
                  onCopyImplementPrompt={() => void copyPrompt()}
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
                    // A commit just went out in this same event (the editor's
                    // blur fires before this container's): the prop still
                    // carries the pre-edit reflection, and remounting with it
                    // would wipe what the user just wrote. Skip exactly one
                    // adoption — the next blur re-arms it.
                    if (justCommitted.current) {
                      justCommitted.current = false;
                      return;
                    }
                    const description = issue.description ?? "";
                    if (
                      descriptionEdited.current ||
                      description === shownDescription.current
                    ) {
                      return;
                    }
                    shownDescription.current = description;
                    latestDescription.current = description;
                    setEditorKey((k) => k + 1);
                  }}
                >
                  {liveDescription.status === "loading" ||
                  (!liveReady && descriptionDocument === undefined) ? (
                    // The description, formatted, while its live session
                    // loads: the live editor then takes its place in the same
                    // frame, never the raw Markdown first.
                    <DeferredDocumentEditor
                      key={`${issue.id}:preview`}
                      mentions={mentions}
                      value={issue.description ?? ""}
                      placeholder={t("descriptionPlaceholder")}
                      readOnly
                    />
                  ) : liveReady ? (
                    <DeferredDocumentEditor
                      key={`${issue.id}:live`}
                      mentions={mentions}
                      value={issue.description ?? ""}
                      uploadScope={`projects/${issue.project_id}`}
                      onLeaveTop={titleBody.leaveBody}
                      document={liveDescription.doc}
                      collaboration={liveDescription.collaboration}
                      placeholder={
                        readOnly ? t("descriptionEmptyReadOnly") : t("descriptionPlaceholder")
                      }
                      readOnly={readOnly}
                    />
                  ) : (
                  <DeferredDocumentEditor
                    key={`${issue.id}:${editorKey}`}
                    mentions={mentions}
                    value={issue.description ?? ""}
                    uploadScope={`projects/${issue.project_id}`}
                    onLeaveTop={titleBody.leaveBody}
                    document={descriptionDocument}
                    onCommit={commitDescription}
                    // Live markdown on every edit: a close (Escape, ✕, outside
                    // click), a tab switch or a window blur can all skip the
                    // editor's blur — the flush reads this instead.
                    onChange={(markdown, content) => {
                      latestDescription.current = markdown;
                      latestDescriptionDocument.current = content;
                    }}
                    onEdit={() => {
                      descriptionEdited.current = true;
                    }}
                    placeholder={
                      readOnly ? t("descriptionEmptyReadOnly") : t("descriptionPlaceholder")
                    }
                    readOnly={readOnly}
                  />
                  )}
                </div>

                {/* Key/value properties — borderless, like the issue cards.
                    Attachments and relations are rows of this table too: each
                    puts its control on the value side and lists its content
                    right under the row, so they read as properties of the
                    ticket rather than sections of their own. */}
                <div className="flex flex-col">
                  {/* A disabled fieldset disables every value picker at once
                      for readers, while the rows keep showing their values. */}
                  <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col border-0 p-0">
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
                  <PropertyRow label={tField("objectiveLinked")}>
                    <ObjectiveValue
                      value={issue.objective_id}
                      objectives={objectives}
                      projectId={issue.project_id}
                      onChange={(objective_id) => void patch({ objective_id })}
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
                  </fieldset>

                  <RelationsSection
                    issue={issue}
                    relations={resolvedRelations}
                    allIssues={allIssues}
                    objectives={objectives}
                    projectKey={projectKey}
                    onOpenIssue={onOpenIssue}
                    onAddRelation={onAddRelation}
                    onRemoveRelation={onRemoveRelation}
                    readOnly={readOnly}
                    addOpen={relationsOpen}
                    onAddOpenChange={setRelationsOpen}
                  />

                  <IssueResourcesSection
                    issueId={issue.id}
                    projectId={issue.project_id}
                    readOnly={readOnly}
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
                        <summary className="text-xs text-muted-foreground">
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
                    readOnly={readOnly}
                  />
                )}

                <IssueActivity
                  readState={readState}
                  onRetryRead={retryRead}
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
                  onRenameAttachment={renameAttachment}
                  canComment={canComment}
                  canModerate={canWrite}
                />
              </TabsContent>
            </Tabs>
          </SidePanelBody>

          <RelationTargetPicker
            position={open && relationType ? menuPointerRef.current : null}
            relation={relationType}
            issues={relationCandidates}
            objectives={relationObjectiveCandidates}
            projectKey={projectKey}
            onClose={() => setRelationType(null)}
            onSelect={(targetId, targetType) => {
              if (relationType) onAddRelation(issue.id, relationType, targetId, { targetType });
              setRelationType(null);
            }}
          />

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

          {canComment && (
            <SidePanelFooter className="flex-col border-t-0 pt-3 sm:flex-col">
              <CommentFollowUpButton followUp={followUp} onCopy={copyCommentsPrompt} />
              <CommentComposer
                members={members}
                projectId={issue.project_id}
                onSubmit={(body, mentions, attachments) =>
                  addComment(body, mentions, null, attachments)
                }
              />
            </SidePanelFooter>
          )}

          {/* Numo takes over the dictation: the border highlights the edge of the panel
            while working — same signal as the Numo “thinking” icon
            which replaces the mic in the header. */}
          <AgentBeamOverlay active={numoBusy} />
        </SidePanelContent>
      </SidePanel>

      <CustomPromptDialog
        open={customPromptOpen}
        onOpenChange={setCustomPromptOpen}
        onSubmit={(instructions) => {
          void runCustomPrompt(instructions);
        }}
      />

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteDialogTitle", { title: issue.title })}
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
