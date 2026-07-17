"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  toast,
} from "mangue-ui";
import {
  ChevronRight,
  ClipboardCopy,
  GitPullRequest,
  MoreHorizontal,
  Plus,
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
import { SubIssuesSection } from "@/components/sub-issues-section";
import { RelationsSection } from "@/components/relations-section";
import { AgentChatModal } from "@/components/agent/agent-chat-modal";
import { IssueAgentChip } from "@/components/agent/issue-agent-chip";
import {
  IssueActionsMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import { useCycleMenuActions } from "@/components/cycle/use-cycle-menu-actions";
import { useIssueAgentRunsQuery } from "@/lib/use-agent-runs";
import { isAgentRunWorking } from "@/lib/agent-api";
import { setAgentComposeDraft } from "@/lib/agent-compose-draft";
import { agentLaunchPromptVariant } from "@/lib/agent-launch-prompt";
import { buildIssuePrompt } from "@/lib/issue-prompt";
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
import { IssueAttachmentsSection } from "@/components/issue-attachments-section";
import { IssuePlan } from "@/components/issue-plan";
import { MarkdownEditor } from "@/components/markdown-editor";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { planProgress } from "@/lib/plan";
import { AutoTextarea } from "@/components/auto-textarea";
import { useAuth } from "@/lib/auth-context";
import { useIssueTimeline } from "@/lib/use-issue-timeline";
import { useIssueDictation } from "@/lib/use-issue-dictation";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { issueIdentifier } from "@/lib/issue-constants";
import { IntegrationIndicator } from "@/components/integration-indicator";
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
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tPlan = useTranslations("Plan");
  const tAgent = useTranslations("Agent");
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"description" | "plan">(initialTab);
  // Remount the description editor when dictation rewrites it — it reads
  // `value` only on mount and commits on blur.
  const [editorKey, setEditorKey] = useState(0);
  // Conversation de l'agent, en modal PAR-DESSUS le panneau : la reprise à chaud
  // ne doit pas coûter le contexte du ticket (la carte, elle, n'a rien à perdre
  // et navigue vers /agents).
  const [chatOpen, setChatOpen] = useState(false);

  const { items, addComment, updateComment, deleteComment, deleteAttachment } =
    useIssueTimeline(issue?.id ?? null);

  // Agent de code de ce ticket. Mêmes dérivations que les cartes (lib/server/
  // agent/activity.ts), mais depuis les runs de l'issue seule : le panneau
  // s'ouvre aussi là où le provider d'activité du board n'existe pas (page Pull
  // requests, board de feedback).
  const { runs } = useIssueAgentRunsQuery(issue?.id ?? null);
  const agentWorking = runs.some((r) => isAgentRunWorking(r.status));
  const latestRun = runs[0] ?? null;
  // Une conversation reprennable existe (au moins une run non `failed`).
  const hasAgentSession = runs.some((r) => r.status !== "failed");
  // Runs triés DESC → la première portant une PR non fermée est la PR du ticket.
  const prRun =
    runs.find((r) => r.pr_number != null && r.pr_state !== "closed") ?? null;

  // Cycle (MIN-32) : le panneau lit le cycle courant lui-même plutôt que de le
  // faire descendre par ses quatre appelants — le hook est déjà gaté par les
  // préférences utilisateur, donc ne coûte rien quand les cycles sont éteints.
  const { currentCycle } = useMyCycleQuery();
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
    onSetIssueCycle
  );

  // Sync the editable title when a different issue opens (not on every tick),
  // and land on the tab the opener asked for (plan indicator → plan tab).
  useEffect(() => {
    if (issue) setTitle(issue.title);
    setTab(initialTab);
  }, [issue?.id, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = useMemo(() => planProgress(issue?.plan), [issue?.plan]);

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
  // Deux points d'entrée, comme sur les cartes :
  //  • ouvrir la conversation existante — ici en modal sur la dernière run, pour
  //    garder le ticket sous les yeux (la carte, elle, navigue vers /agents) ;
  //  • lancer une session NEUVE — pose un brouillon de composition optimiste et
  //    ouvre son composer (`?compose=`), même si le ticket a déjà une session.
  const startNewAgentSession = useCallback(() => {
    if (!issue) return;
    // « Nouvelle session » sur un ticket DÉJÀ pourvu (branche/PR/contexte hérités) →
    // composer VIERGE : l'utilisateur dicte lui-même la consigne. Premier lancement à
    // froid → prompt d'amorçage (contexte du ticket, adapté à son plan / effort).
    const identifier = issueIdentifier(projectKey, issue.number);
    const prompt = hasAgentSession
      ? ""
      : `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent(`launchPrompt.${agentLaunchPromptVariant(issue)}`)}`;
    setAgentComposeDraft({
      issueId: issue.id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      projectId: issue.project_id,
      projectKey,
      prompt,
    });
    router.push(`/agents?compose=${issue.id}`);
  }, [issue, hasAgentSession, projectKey, router, tAgent]);

  // ⇧A : ticket déjà pourvu d'une session → on l'ouvre ; sinon on en démarre une neuve.
  const launchAgent = useCallback(() => {
    if (hasAgentSession) setChatOpen(true);
    else startNewAgentSession();
  }, [hasAgentSession, startNewAgentSession]);

  const openPr = useCallback(() => {
    if (prRun) router.push(`/pull-requests?run=${prRun.id}`);
  }, [prRun, router]);

  const copyPrompt = useCallback(async () => {
    if (!issue) return;
    // MIN-20 : copier le prompt démarre le ticket (option activée par défaut,
    // désactivable dans Compte → Préférences). On n'avance que les statuts
    // pré-travail, et le toast ne signale le déplacement que s'il a eu lieu.
    const autoStart =
      resolvePromptCopyAutoStart(user?.user_metadata) &&
      shouldAutoStartOnPromptCopy(issue.status);
    // Le XML copié doit refléter l'état RÉEL après déplacement : si on passe le
    // ticket « En cours », le prompt le décrit déjà `in_progress`, pas l'ancien.
    const promptIssue = autoStart
      ? { ...issue, status: "in_progress" as const }
      : issue;
    const titleById = new Map(allIssues.map((i) => [i.id, i.title]));
    const promptRelations = resolvedRelations.map((r) => ({
      type: r.relation,
      identifier: issueIdentifier(projectKey, r.otherNumber),
      title: titleById.get(r.otherId) ?? "",
    }));
    // Noms des catégories (les IDs vivent sur l'issue, les noms dans `categories`).
    const promptCategories = issue.category_ids
      .map((cid) => categories.find((c) => c.id === cid)?.name)
      .filter((name): name is string => !!name);
    await navigator.clipboard.writeText(
      buildIssuePrompt({
        issue: promptIssue,
        projectId: issue.project_id,
        projectKey,
        categories: promptCategories,
        relations: promptRelations,
        attachmentCount: issue.attachment_count,
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
  }, [
    issue,
    allIssues,
    resolvedRelations,
    categories,
    projectKey,
    user?.user_metadata,
    onUpdate,
    t,
  ]);

  // Field shortcuts (S/P/E/A/L/D/O) — active while the pointer hovers the panel
  // body; the picker opens at the cursor, in the key/value section. `d` maps to
  // the due-date picker here just like on board cards (voice dictation lives on
  // `v`, so nothing needs to be freed). ⇧P / ⇧A doublent le menu « ⋯ », comme sur
  // les cartes ; le hook ne les déclenche jamais pendant une saisie (titre,
  // description, commentaire).
  const { containerProps, menuState, closeMenu } = useIssueFieldShortcuts(open, {
    "shift+p": () => void copyPrompt(),
    "shift+a": launchAgent,
  });

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
    if (fields.title !== undefined) setTitle(fields.title);
    if (fields.description !== undefined) setEditorKey((k) => k + 1);
    if (category_ids) {
      void onSetCategories(issue.id, category_ids).catch((err) =>
        toast.error((err as Error).message)
      );
    }
  };

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
    if (trimmed && trimmed !== issue.title) void patch({ title: trimmed });
    else if (!trimmed) setTitle(issue.title);
  };

  const commitDescription = (markdown: string) => {
    const next = markdown.trim() || null;
    if (next !== (issue.description ?? null)) void patch({ description: next });
  };

  const handleDelete = async () => {
    await onDelete(issue.id);
    toast.success(t("issueDeletedToast"));
    onOpenChange(false);
  };

  // Menu « ⋯ » de l'en-tête : la parité d'actions avec le clic droit d'une carte
  // (prompt, agent, PR, cycle), plus la suppression qui vivait ici avant.
  const menuActions: ContextMenuAction[] = [
    {
      id: "copy-prompt",
      label: t("copyAsPrompt"),
      icon: <ClipboardCopy className="size-4" />,
      shortcut: "⇧P",
      onSelect: () => void copyPrompt(),
    },
    // Session existante → deux entrées : « Ouvrir l'agent » (reprend la dernière
    // run, en modal) et « Nouvelle session » (compose une run neuve sur le
    // ticket). Aucune session → une seule entrée « Lancer un agent » (à froid).
    ...(hasAgentSession
      ? [
          {
            id: "open-agent",
            label: tAgent("openAgent"),
            icon: <NumoIcon className="size-4" />,
            shortcut: "⇧A",
            onSelect: () => setChatOpen(true),
          },
          {
            id: "new-agent-session",
            label: tAgent("newSession"),
            icon: <Plus className="size-4" />,
            onSelect: startNewAgentSession,
          },
        ]
      : [
          {
            id: "launch-agent",
            label: tAgent("menuLaunch"),
            icon: <NumoIcon className="size-4" />,
            shortcut: "⇧A",
            onSelect: startNewAgentSession,
          },
        ]),
    ...(prRun
      ? [
          {
            id: "open-pr",
            label: tAgent("viewPullRequest"),
            icon: <GitPullRequest className="size-4" />,
            onSelect: openPr,
          },
        ]
      : []),
    ...buildCycleActions(issue),
    {
      id: "delete",
      label: tCommon("delete"),
      icon: <Trash2 className="size-4" />,
      separatorBefore: true,
      variant: "destructive",
      onSelect: () => setConfirmDelete(true),
    },
  ];

  return (
    <>
      <SidePanel open={open} onOpenChange={onOpenChange}>
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
                  {parent && (
                    <>
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
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    </>
                  )}
                  {issueIdentifier(projectKey, issue.number)}
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
              {/* Agent de code : le seul état qui mérite l'en-tête (au travail,
                  ou une PR à relire) — le reste est dans le menu « ⋯ ». */}
              <IssueAgentChip
                working={agentWorking}
                prRun={prRun}
                onOpenConversation={() => setChatOpen(true)}
                onOpenPr={openPr}
              />
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
                  shortcutKey="shift+v"
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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

            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "description" | "plan")}
            >
              <TabsList variant="line" className="w-full justify-start p-0">
                <TabsTrigger value="description">
                  {tPlan("tabDescription")}
                </TabsTrigger>
                <TabsTrigger value="plan" className="gap-1.5">
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
                />
              </TabsContent>

              <TabsContent value="description" className="mt-4 flex flex-col gap-6">
                <MarkdownEditor
                  key={`${issue.id}:${editorKey}`}
                  value={issue.description ?? ""}
                  onCommit={commitDescription}
                  placeholder={t("descriptionPlaceholder")}
                />

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
                    />
                  </PropertyRow>
                  <PropertyRow label={tField("objectiveLinked")}>
                    <ObjectiveValue
                      value={issue.objective_id}
                      objectives={objectives}
                      onChange={(objective_id) => void patch({ objective_id })}
                    />
                  </PropertyRow>

                  <IssueAttachmentsSection
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
        </SidePanelContent>
      </SidePanel>

      {/* Reprise à chaud de la conversation, PAR-DESSUS le panneau : ouvre la
          dernière run et donne accès à l'historique des runs du ticket. Montée
          seulement quand une run existe — sans `initialRunId` la modal
          retomberait sur un composer, ce que fait déjà « Nouvelle session ». */}
      {latestRun && (
        <AgentChatModal
          open={chatOpen}
          onOpenChange={setChatOpen}
          issueId={issue.id}
          issueIdentifier={issueIdentifier(projectKey, issue.number)}
          initialRunId={latestRun.id}
        />
      )}

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription")}
        confirmLabel={tCommon("delete")}
        onConfirm={handleDelete}
      />
    </>
  );
}
