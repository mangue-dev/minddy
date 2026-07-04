"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  ConfirmDeleteDialog,
  SidePanel,
  SidePanelBody,
  SidePanelContent,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelTitle,
  toast,
} from "mangue-ui";
import { Trash2 } from "lucide-react";
import {
  AssigneePicker,
  DueDateField,
  EffortPicker,
  ObjectivePicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/issue-fields";
import { CategoryPicker } from "@/components/category-picker";
import { issueIdentifier } from "@/lib/issue-constants";
import type {
  Category,
  Issue,
  IssueUpdateInput,
  Member,
  Objective,
} from "@/lib/types";

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function IssueSidePanel({
  issue,
  open,
  onOpenChange,
  projectKey,
  members,
  categories,
  objectives,
  onUpdate,
  onDelete,
  onSetCategories,
}: {
  issue: Issue | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  onUpdate: (issueId: string, updates: IssueUpdateInput) => Promise<unknown>;
  onDelete: (issueId: string) => Promise<void>;
  onSetCategories: (issueId: string, categoryIds: string[]) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync editable fields when a different issue opens (not on every realtime tick).
  useEffect(() => {
    if (issue) {
      setTitle(issue.title);
      setDescription(issue.description ?? "");
    }
  }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!issue) return null;

  const patch = async (updates: IssueUpdateInput) => {
    try {
      await onUpdate(issue.id, updates);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const commitTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== issue.title) void patch({ title: trimmed });
    else if (!trimmed) setTitle(issue.title);
  };

  const commitDescription = () => {
    const next = description.trim() || null;
    if (next !== (issue.description ?? null)) void patch({ description: next });
  };

  const handleDelete = async () => {
    await onDelete(issue.id);
    toast.success("Issue supprimée.");
    onOpenChange(false);
  };

  return (
    <>
      <SidePanel open={open} onOpenChange={onOpenChange}>
        <SidePanelContent>
          <SidePanelHeader>
            <SidePanelTitle asChild>
              <Badge variant="secondary" className="font-mono">
                {issueIdentifier(projectKey, issue.number)}
              </Badge>
            </SidePanelTitle>
          </SidePanelHeader>

          <SidePanelBody className="flex flex-col gap-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              className="w-full bg-transparent text-lg font-semibold outline-none"
              placeholder="Titre"
            />

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              placeholder="Ajoute une description…"
              rows={5}
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />

            <div className="border-t border-border pt-2">
              <FieldRow label="Statut">
                <StatusPicker
                  value={issue.status}
                  onChange={(status) => void patch({ status })}
                />
              </FieldRow>
              <FieldRow label="Priorité">
                <PriorityPicker
                  value={issue.priority}
                  onChange={(priority) => void patch({ priority })}
                />
              </FieldRow>
              <FieldRow label="Assigné">
                <AssigneePicker
                  value={issue.assignee_id}
                  onChange={(assignee_id) => void patch({ assignee_id })}
                  members={members}
                />
              </FieldRow>
              <FieldRow label="Objectif">
                <ObjectivePicker
                  value={issue.objective_id}
                  onChange={(objective_id) => void patch({ objective_id })}
                  objectives={objectives}
                />
              </FieldRow>
              <FieldRow label="Effort">
                <EffortPicker
                  value={issue.effort}
                  onChange={(effort) => void patch({ effort })}
                />
              </FieldRow>
              <FieldRow label="Échéance">
                <DueDateField
                  value={issue.due_date}
                  onChange={(due_date) => void patch({ due_date })}
                  className="w-44"
                />
              </FieldRow>
              <FieldRow label="Catégories">
                <CategoryPicker
                  categories={categories}
                  value={issue.category_ids}
                  onChange={(ids) => {
                    void onSetCategories(issue.id, ids).catch((err) =>
                      toast.error((err as Error).message)
                    );
                  }}
                />
              </FieldRow>
            </div>
          </SidePanelBody>

          <SidePanelFooter>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              Supprimer l&apos;issue
            </Button>
          </SidePanelFooter>
        </SidePanelContent>
      </SidePanel>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer l'issue ?"
        description="Cette action est définitive."
        confirmLabel="Supprimer"
        onConfirm={handleDelete}
      />
    </>
  );
}
