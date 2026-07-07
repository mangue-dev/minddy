"use client";

import { useEffect, useState } from "react";
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
  toast,
} from "mangue-ui";
import { Trash2, X } from "lucide-react";
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
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import { MarkdownEditor } from "@/components/markdown-editor";
import { AutoTextarea } from "@/components/auto-textarea";
import { useAuth } from "@/lib/auth-context";
import { useIssueTimeline } from "@/lib/use-issue-timeline";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { issueIdentifier } from "@/lib/issue-constants";
import { IntegrationIndicator } from "@/components/integration-indicator";
import type {
  Category,
  CreateIssueInput,
  Issue,
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
  onUpdate,
  onDelete,
  onSetCategories,
  onCreate,
  onOpenIssue,
}: {
  issue: Issue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  allIssues: Issue[];
  onUpdate: (issueId: string, updates: IssueUpdateInput) => Promise<unknown>;
  onDelete: (issueId: string) => Promise<void>;
  onSetCategories: (issueId: string, categoryIds: string[]) => Promise<void>;
  onCreate: (input: CreateIssueInput) => Promise<unknown>;
  onOpenIssue: (id: string) => void;
}) {
  const { user } = useAuth();
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const [title, setTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { items, addComment, updateComment, deleteComment } = useIssueTimeline(
    issue?.id ?? null
  );

  // Sync the editable title when a different issue opens (not on every tick).
  useEffect(() => {
    if (issue) setTitle(issue.title);
  }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!issue) return null;

  const patch = async (updates: IssueUpdateInput) => {
    try {
      await onUpdate(issue.id, updates);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isChild = !!issue.parent_id;

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
        <SidePanelContent onInteractOutside={keepOverlayOpenForPopper}>
          {/* Header: identifier · delete · close */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-3">
            <SidePanelTitle asChild>
              <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <IntegrationIndicator issue={issue} iconClassName="size-4" />
                {issueIdentifier(projectKey, issue.number)}
              </span>
            </SidePanelTitle>
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

          <SidePanelBody className="flex flex-col gap-6 pt-0">
            {/* Title + description */}
            <div className="flex flex-col gap-2">
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
                className="w-full overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
                placeholder={t("titlePlaceholder")}
              />
              <MarkdownEditor
                key={issue.id}
                value={issue.description ?? ""}
                onCommit={commitDescription}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>

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
              onReply={(parentId, body, mentions) => addComment(body, mentions, parentId)}
              onEditComment={updateComment}
              onDeleteComment={deleteComment}
            />
          </SidePanelBody>

          <SidePanelFooter className="border-t-0 pt-3 sm:flex-row">
            <CommentComposer members={members} onSubmit={addComment} />
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
