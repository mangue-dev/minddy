"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ChevronRight, Trash2, X } from "lucide-react";
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
import { LaunchAgentButton } from "@/components/agent/launch-agent-button";
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
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tPlan = useTranslations("Plan");
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<"description" | "plan">(initialTab);
  // Remount the description editor when dictation rewrites it — it reads
  // `value` only on mount and commits on blur.
  const [editorKey, setEditorKey] = useState(0);

  const { items, addComment, updateComment, deleteComment, deleteAttachment } =
    useIssueTimeline(issue?.id ?? null);

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

  // Field shortcuts (S/P/E/A/L/D/O) — active while the pointer hovers the panel
  // body; the picker opens at the cursor, in the key/value section. `d` maps to
  // the due-date picker here just like on board cards (voice dictation lives on
  // `v`, so nothing needs to be freed).
  const { containerProps, menuState, closeMenu } = useIssueFieldShortcuts(open);

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
          {/* Header: identifier · dictate · delete · close */}
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
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("deleteAriaLabel")}
                className="rounded-full text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 />
              </Button>
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

                <IssueAttachmentsSection
                  issueId={issue.id}
                  projectId={issue.project_id}
                />

                {/* Key/value properties — borderless, like the issue cards */}
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

                <RelationsSection
                  issue={issue}
                  relations={resolvedRelations}
                  allIssues={allIssues}
                  projectKey={projectKey}
                  onOpenIssue={onOpenIssue}
                  onAddRelation={onAddRelation}
                  onRemoveRelation={onRemoveRelation}
                />

                <LaunchAgentButton
                  issueId={issue.id}
                  issueNumber={issue.number}
                  issueTitle={issue.title}
                  issuePlan={issue.plan}
                  issueEffort={issue.effort}
                  projectId={issue.project_id}
                  projectKey={projectKey}
                  issueIdentifier={issueIdentifier(projectKey, issue.number)}
                />

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
