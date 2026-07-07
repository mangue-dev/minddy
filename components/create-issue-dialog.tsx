"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenuItem,
  Spinner,
  SplitButton,
  Switch,
  toast,
} from "mangue-ui";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { ProjectOrb } from "@/components/project-orb";
import {
  AssigneeCompact,
  CategoriesCompact,
  DueDateCompact,
  EffortCompact,
  ObjectiveCompact,
  PriorityCompact,
  StatusCompact,
} from "@/components/issue-compact-fields";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import type {
  IssueStatus,
  IssuePriority,
  IssueEffort,
} from "@/lib/issue-constants";
import type {
  Category,
  CreateIssueInput,
  IssueDraftPatch,
  Member,
  Objective,
  Project,
} from "@/lib/types";

const DEFAULTS = {
  status: "backlog" as IssueStatus,
  priority: "none" as IssuePriority,
  effort: null as IssueEffort | null,
  assignee_id: null as string | null,
  objective_id: null as string | null,
  due_date: null as string | null,
};

type DictateTurn = { role: "user" | "assistant"; content: string };

/** Numo emits due dates as naive local datetimes ("2026-07-10T00:00:00") —
 *  interpret them in the browser's timezone and store the usual ISO instant
 *  (local midnight = date-only, matching the DateTimePicker convention). */
function normalizeDueDate(value: string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  projectId,
  projects,
  members,
  categories,
  objectives,
  onCreate,
  onCreateInProject,
  initialStatus,
  initialObjectiveId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** All the user's projects — powers the "create in another project" menu. */
  projects: Project[];
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  onCreate: (input: CreateIssueInput) => Promise<unknown>;
  /** Create in an arbitrary project (the split-button dropdown targets). */
  onCreateInProject: (
    targetProjectId: string,
    input: CreateIssueInput,
  ) => Promise<unknown>;
  /** Preset the status column the issue lands in (e.g. from a column's "+"). */
  initialStatus?: IssueStatus;
  /** Preset the objective (when creating from an objective-filtered board). */
  initialObjectiveId?: string | null;
}) {
  const t = useTranslations("IssueUI");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState(DEFAULTS);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [createMore, setCreateMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Closing the discard confirmation lets the dismissing pointer/click fall
  // through to this dialog below it and read as an outside click — which would
  // immediately re-open the confirmation just dismissed. This ref muffles the
  // dialog's close signal for the brief window right after the confirm closes.
  const ignoreCloseAfterConfirmRef = useRef(false);
  // Remount the markdown editor to swap its content (it only commits on blur).
  const [editorKey, setEditorKey] = useState(0);
  // Live emptiness of the editor — `description` alone would miss text that was
  // typed but not yet committed (commit happens on blur) when the dialog closes.
  const editorNonEmptyRef = useRef(false);
  const [numoBusy, setNumoBusy] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const createMoreId = useId();
  // Throwaway dictation session — history feeds Numo's follow-up commands and
  // dies with the dialog (nothing persisted).
  const dictateHistoryRef = useRef<DictateTurn[]>([]);
  const dictateAbortRef = useRef<AbortController | null>(null);

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

  const clearContent = () => {
    setTitle("");
    setDescription("");
    setEditorKey((k) => k + 1);
  };

  const reset = () => {
    clearContent();
    setFields(DEFAULTS);
    setCategoryIds([]);
    setCreateMore(false);
    editorNonEmptyRef.current = false;
    dictateHistoryRef.current = [];
    dictateAbortRef.current?.abort();
    dictateAbortRef.current = null;
    setNumoBusy(false);
  };

  const closeAndReset = () => {
    reset();
    onOpenChange(false);
  };

  // Typed text is the only thing worth guarding — pickers are two clicks to redo.
  const draftHasContent = () =>
    title.trim() !== "" ||
    description.trim() !== "" ||
    editorNonEmptyRef.current;

  const handleOpenChange = (next: boolean) => {
    // Swallow close signals while the confirmation owns the decision (it's up),
    // and for the brief window right after it closes — that window is the
    // fall-through click that would otherwise re-open the confirmation in a loop.
    if (!next && (confirmDiscard || ignoreCloseAfterConfirmRef.current)) return;
    if (!next && draftHasContent()) {
      setConfirmDiscard(true);
      return;
    }
    if (!next) reset();
    onOpenChange(next);
  };

  // Route the confirmation's own open/close through here so we can arm the
  // fall-through guard the instant it closes (keep-editing, Escape, or after
  // confirming). "Abandonner" still closes the dialog via closeAndReset, which
  // calls onOpenChange directly and bypasses handleOpenChange's guard.
  const handleConfirmOpenChange = (open: boolean) => {
    setConfirmDiscard(open);
    if (!open) {
      ignoreCloseAfterConfirmRef.current = true;
      window.setTimeout(() => {
        ignoreCloseAfterConfirmRef.current = false;
      }, 300);
    }
  };

  // `target` is set only when creating in a different project (dropdown item).
  const submit = async (keepOpen: boolean, target?: Project) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const other = target && target.id !== projectId ? target : null;
    setSubmitting(true);
    try {
      if (other) {
        // Cross-project: assignee / objective / categories reference THIS
        // project's entities and don't exist in the target — only the portable
        // fields travel. (Statuses, priority, effort are global constants.)
        await onCreateInProject(other.id, {
          title: trimmed,
          description: description.trim() || null,
          status: fields.status,
          priority: fields.priority,
          effort: fields.effort,
          due_date: fields.due_date,
        });
        toast.success(t("issueCreatedInProjectToast", { project: other.name }));
      } else {
        await onCreate({
          title: trimmed,
          description: description.trim() || null,
          ...fields,
          category_ids: categoryIds,
        });
        toast.success(t("issueCreatedToast"));
      }
      // The dictation session is about the issue that was just created — a
      // follow-up recording starts fresh.
      dictateHistoryRef.current = [];
      if (keepOpen) {
        // Rapid entry: keep the same field values, clear title + description.
        clearContent();
        titleRef.current?.focus();
      } else {
        // Direct close — the draft just became an issue, nothing to guard.
        closeAndReset();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const currentProject = projects.find((p) => p.id === projectId) ?? null;
  const otherProjects = projects.filter((p) => p.id !== projectId);

  const applyPatch = (patch: IssueDraftPatch) => {
    if (typeof patch.title === "string") setTitle(patch.title);
    if (typeof patch.description === "string") {
      setDescription(patch.description);
      setEditorKey((k) => k + 1); // remount the editor with the new content
    }
    setFields((f) => ({
      ...f,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.effort !== undefined ? { effort: patch.effort } : {}),
      ...(patch.assignee_id !== undefined
        ? { assignee_id: patch.assignee_id }
        : {}),
      ...(patch.objective_id !== undefined
        ? { objective_id: patch.objective_id }
        : {}),
      ...(patch.due_date !== undefined
        ? { due_date: normalizeDueDate(patch.due_date) }
        : {}),
    }));
    if (Array.isArray(patch.category_ids)) setCategoryIds(patch.category_ids);
  };

  const handleDictation = async (transcript: string) => {
    setNumoBusy(true);
    const controller = new AbortController();
    dictateAbortRef.current = controller;
    try {
      const res = await fetch(`/api/projects/${projectId}/dictate-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          draft: { title, description, ...fields, category_ids: categoryIds },
          history: dictateHistoryRef.current,
          // Numo returns naive local datetimes; we normalize them here, in the
          // browser's timezone (see applyPatch).
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(t("dictateFailed"));
      const data = (await res.json()) as {
        patch: IssueDraftPatch;
        reply: string;
      };
      applyPatch(data.patch);
      dictateHistoryRef.current = [
        ...dictateHistoryRef.current,
        { role: "user" as const, content: transcript },
        { role: "assistant" as const, content: data.reply },
      ].slice(-12);
      // Fields moving are the feedback; surface Numo's reply only when nothing
      // visibly changed (unknown name, unclear command…).
      if (Object.keys(data.patch).length === 0 && data.reply)
        toast.info(data.reply);
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error(t("dictateFailed"));
    } finally {
      if (dictateAbortRef.current === controller) {
        dictateAbortRef.current = null;
        setNumoBusy(false);
      }
    }
  };
  // The DictateButton captures its callback when recording starts; route the
  // call through a ref so it always reads the current form state (a mic click
  // also blurs the description editor, committing it just before recording).
  const handleDictationRef = useRef(handleDictation);
  useEffect(() => {
    handleDictationRef.current = handleDictation;
  });

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="p-8 sm:max-w-2xl"
          showCloseButton={false}
          onInteractOutside={keepOverlayOpenForPopper}
        >
          <DialogTitle className="sr-only">{t("newIssueTitle")}</DialogTitle>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(createMore);
            }}
            className="flex flex-col"
          >
            <AutoTextarea
              ref={titleRef}
              autoFocus
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void submit(e.shiftKey || createMore);
              }}
              placeholder={t("titlePlaceholder")}
              className="w-full overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
            />
            <MarkdownEditor
              key={editorKey}
              value={description}
              onCommit={setDescription}
              onEmptyChange={(empty) => {
                editorNonEmptyRef.current = !empty;
              }}
              placeholder={t("createDescriptionPlaceholder")}
              className="mt-2 min-h-16"
            />

            {/* Options — one compact inline row, like the Figma mockup */}
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <StatusCompact
                value={fields.status}
                onChange={(status) => setFields((f) => ({ ...f, status }))}
              />
              <PriorityCompact
                value={fields.priority}
                onChange={(priority) => setFields((f) => ({ ...f, priority }))}
              />
              <EffortCompact
                value={fields.effort}
                onChange={(effort) => setFields((f) => ({ ...f, effort }))}
              />
              <CategoriesCompact
                categories={categories}
                value={categoryIds}
                onChange={setCategoryIds}
              />
              <AssigneeCompact
                value={fields.assignee_id}
                onChange={(assignee_id) =>
                  setFields((f) => ({ ...f, assignee_id }))
                }
                members={members}
              />
              <DueDateCompact
                value={fields.due_date}
                onChange={(due_date) => setFields((f) => ({ ...f, due_date }))}
              />
              <ObjectiveCompact
                value={fields.objective_id}
                onChange={(objective_id) =>
                  setFields((f) => ({ ...f, objective_id }))
                }
                objectives={objectives}
              />
            </div>

            {/* Bottom bar — voice dictation at left, create controls at right */}
            <div className="mt-8 flex items-center gap-3">
              {numoBusy ? (
                <span
                  className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center"
                  aria-hidden
                >
                  <NumoIcon
                    state="thinking"
                    className="size-6 text-primary animate-in fade-in duration-300"
                  />
                </span>
              ) : (
                <DictateButton
                  onTranscription={(text) =>
                    void handleDictationRef.current(text)
                  }
                  disabled={submitting}
                  className="-ml-2"
                />
              )}
              {numoBusy && (
                <span className="sr-only" role="status">
                  {t("numoWorking")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-4">
                <label
                  htmlFor={createMoreId}
                  className="cursor-pointer text-sm text-foreground"
                >
                  {t("createMore")}
                </label>
                <Switch
                  id={createMoreId}
                  checked={createMore}
                  onCheckedChange={setCreateMore}
                />
                {otherProjects.length > 0 && currentProject ? (
                  <SplitButton
                    type="submit"
                    disabled={submitting || numoBusy || !title.trim()}
                    actionClassName="rounded-l-full pl-4"
                    triggerClassName="rounded-r-full"
                    menuLabel={t("createInOtherProject")}
                    menu={otherProjects.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onSelect={() => void submit(createMore, p)}
                      >
                        <ProjectOrb seed={p.id} className="size-4" />
                        <span className="truncate">{p.name}</span>
                      </DropdownMenuItem>
                    ))}
                  >
                    {submitting && <Spinner />}
                    <span className="max-w-[14rem] truncate">
                      {t("createInProject", { project: currentProject.name })}
                    </span>
                  </SplitButton>
                ) : (
                  <Button
                    type="submit"
                    className="rounded-full px-4"
                    disabled={submitting || numoBusy || !title.trim()}
                  >
                    {submitting && <Spinner />}
                    {t("createTicket")}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dismissing a non-empty draft asks first — Escape / outside click / any
        close path funnels through handleOpenChange above. */}
      <ConfirmDeleteDialog
        open={confirmDiscard}
        onOpenChange={handleConfirmOpenChange}
        title={t("discardDraftTitle")}
        description={t("discardDraftDescription")}
        confirmLabel={t("discardDraftConfirm")}
        cancelLabel={t("discardDraftKeepEditing")}
        onConfirm={closeAndReset}
      />
    </>
  );
}
