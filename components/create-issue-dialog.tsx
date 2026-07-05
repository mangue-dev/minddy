"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  toast,
} from "mangue-ui";
import {
  AssigneePicker,
  DueDateField,
  EffortPicker,
  ObjectivePicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/issue-fields";
import { CategoryPicker } from "@/components/category-picker";
import type {
  IssueStatus,
  IssuePriority,
  IssueEffort,
} from "@/lib/issue-constants";
import type { Category, CreateIssueInput, Member, Objective } from "@/lib/types";

const DEFAULTS = {
  status: "backlog" as IssueStatus,
  priority: "none" as IssuePriority,
  effort: null as IssueEffort | null,
  assignee_id: null as string | null,
  objective_id: null as string | null,
  due_date: null as string | null,
};

export function CreateIssueDialog({
  open,
  onOpenChange,
  members,
  categories,
  objectives,
  onCreate,
  initialStatus,
  initialObjectiveId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  onCreate: (input: CreateIssueInput) => Promise<unknown>;
  /** Preset the status column the issue lands in (e.g. from a column's "+"). */
  initialStatus?: IssueStatus;
  /** Preset the objective (when creating from an objective-filtered board). */
  initialObjectiveId?: string | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState(DEFAULTS);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Apply the presets each time the dialog opens (a column's "+" reopens it with
  // that column's status; objective mode reopens it with the objective set).
  useEffect(() => {
    if (!open) return;
    setFields((f) => ({
      ...f,
      status: initialStatus ?? DEFAULTS.status,
      objective_id: initialObjectiveId ?? DEFAULTS.objective_id,
    }));
  }, [open, initialStatus, initialObjectiveId]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setFields(DEFAULTS);
    setCategoryIds([]);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async (keepOpen: boolean) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onCreate({
        title: trimmed,
        description: description.trim() || null,
        ...fields,
        category_ids: categoryIds,
      });
      toast.success("Issue créée.");
      if (keepOpen) {
        // Rapid entry: keep the same field defaults, clear the title.
        setTitle("");
        setDescription("");
      } else {
        handleOpenChange(false);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle issue</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                void submit(true);
              }
            }}
            placeholder="Titre de l'issue"
            className="h-11 border-0 px-0 text-base shadow-none focus-visible:ring-0 md:text-base"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optionnelle)"
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />

          <div className="flex flex-wrap gap-2">
            <StatusPicker
              value={fields.status}
              onChange={(status) => setFields((f) => ({ ...f, status }))}
            />
            <PriorityPicker
              value={fields.priority}
              onChange={(priority) => setFields((f) => ({ ...f, priority }))}
            />
            <AssigneePicker
              value={fields.assignee_id}
              onChange={(assignee_id) => setFields((f) => ({ ...f, assignee_id }))}
              members={members}
            />
            <EffortPicker
              value={fields.effort}
              onChange={(effort) => setFields((f) => ({ ...f, effort }))}
            />
            <ObjectivePicker
              value={fields.objective_id}
              onChange={(objective_id) => setFields((f) => ({ ...f, objective_id }))}
              objectives={objectives}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DueDateField
              value={fields.due_date}
              onChange={(due_date) => setFields((f) => ({ ...f, due_date }))}
              className="w-44"
            />
            <CategoryPicker
              categories={categories}
              value={categoryIds}
              onChange={setCategoryIds}
            />
          </div>

          <DialogFooter className="items-center">
            <span className="mr-auto text-xs text-muted-foreground">
              ⏎ pour créer · ⇧⏎ pour en enchaîner
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting && <Spinner />}
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
