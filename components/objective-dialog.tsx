"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenuItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  SplitButton,
  cn,
  toast,
} from "mangue-ui";
import { Check } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import { AssigneeCompact } from "@/components/issue-compact-fields";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { ProjectOrb } from "@/components/project-orb";
import { DraftRecoveryRow } from "@/components/draft-recovery-row";
import { CloseDraftDialog } from "@/components/close-draft-dialog";
import { useDrafts } from "@/lib/use-drafts";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_MAP,
  type ObjectiveStatus,
} from "@/lib/objective-constants";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import type {
  CreateObjectiveInput,
  Member,
  Objective,
  ObjectiveUpdateInput,
  Project,
} from "@/lib/types";

// Bare (borderless) compact-field trigger — matches issue-compact-fields.tsx so
// the objective dialog's options row reads like the create-issue dialog's.
const BARE =
  "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

/** Icon + label status picker for the compact options row. */
function ObjectiveStatusCompact({
  value,
  onChange,
}: {
  value: ObjectiveStatus;
  onChange: (v: ObjectiveStatus) => void;
}) {
  const t = useTranslations("Objectives");
  const tStatus = useTranslations("ObjectiveStatus");
  const meta = OBJECTIVE_STATUS_MAP[value];
  const Icon = meta.icon;
  const options: PickerOption[] = OBJECTIVE_STATUSES.map((s) => {
    const SIcon = s.icon;
    return {
      value: s.value,
      label: tStatus(s.value),
      icon: <SIcon className={cn("size-4", s.color)} />,
    };
  });
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as ObjectiveStatus)}
      options={options}
      tooltip={t("statusFieldLabel")}
      trigger={
        <button type="button" aria-label={t("statusFieldLabel")} className={BARE}>
          <Icon className={cn("size-[18px] shrink-0", meta.color)} />
          <span>{tStatus(meta.value)}</span>
        </button>
      }
    />
  );
}

/** Color swatch picker — a single dot trigger opening the palette in a popover. */
function ColorCompact({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("Objectives");
  const [open, setOpen] = useState(false);
  const pick = (c: string | null) => {
    onChange(c);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t("colorFieldLabel")} className={BARE}>
          <span
            className={cn(
              "flex size-[18px] shrink-0 items-center justify-center rounded-full",
              value === null && "border border-dashed border-muted-foreground/60"
            )}
            style={value ? { backgroundColor: value } : undefined}
          />
          <span className="text-muted-foreground">{t("colorFieldLabel")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => pick(null)}
            aria-label={t("noColor")}
            className={cn(
              "flex size-6 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground",
              value === null && "ring-2 ring-ring ring-offset-2 ring-offset-background"
            )}
          >
            ∅
          </button>
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pick(c)}
              aria-label={t("colorAria", { color: c })}
              className={cn(
                "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background",
                value === c && "ring-2 ring-ring"
              )}
              style={{ backgroundColor: c }}
            >
              {value === c && <Check className="size-3.5 text-white" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const EMPTY = {
  name: "",
  description: "",
  status: "planned" as ObjectiveStatus,
  lead_user_id: null as string | null,
  target_date: null as string | null,
  color: null as string | null,
};

export function ObjectiveDialog({
  open,
  onOpenChange,
  members,
  objective,
  onCreate,
  onUpdate,
  projects = [],
  projectId,
  onCreateInProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  /** When set, the dialog edits this objective; otherwise it creates one. */
  objective?: Objective | null;
  onCreate: (input: CreateObjectiveInput) => Promise<unknown>;
  onUpdate: (id: string, updates: ObjectiveUpdateInput) => Promise<unknown>;
  /** All the user's projects — powers the "create in another project" split. */
  projects?: Project[];
  /** The project `onCreate` targets — labels the split button's primary action. */
  projectId?: string;
  /** Create in an arbitrary project (the split-button dropdown targets). */
  onCreateInProject?: (
    targetProjectId: string,
    input: CreateObjectiveInput
  ) => Promise<unknown>;
}) {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  // Id of the draft loaded in the form (MIN-41), so re-closing updates it in
  // place and a successful create removes exactly the draft it came from.
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  // Dismissing a create form with content asks first (MIN-41) — confirming
  // stashes it as a local draft rather than losing it.
  const [confirmClose, setConfirmClose] = useState(false);
  // Closing the confirmation lets the dismissing click fall through to this
  // dialog as an outside click, which would re-open the confirmation just
  // dismissed. This ref muffles the close signal for the brief window after.
  const ignoreCloseAfterConfirmRef = useRef(false);
  // Live emptiness of the description editor — `form.description` alone would
  // miss text typed but not yet committed (commit happens on blur).
  const editorNonEmptyRef = useRef(false);
  // Remount the markdown editor to swap its content (it only reads `value` on
  // mount and commits on blur) when the dialog opens on a new/other objective.
  const [editorKey, setEditorKey] = useState(0);

  // Drafts only apply to the create flow (editing lives in the side panel) and
  // need a home project to scope to.
  const draftsEnabled = !objective && !!projectId;
  const drafts = useDrafts("objective", projectId ?? null, open && draftsEnabled);

  const currentProject = projects.find((p) => p.id === projectId) ?? null;
  const otherProjects = projects.filter((p) => p.id !== projectId);
  // Only in create mode, and only when there's somewhere else to create it.
  const showSplit =
    !objective && !!onCreateInProject && !!currentProject && otherProjects.length > 0;

  useEffect(() => {
    if (!open) return;
    setForm(
      objective
        ? {
            name: objective.name,
            description: objective.description ?? "",
            status: objective.status,
            lead_user_id: objective.lead_user_id,
            target_date: objective.target_date,
            color: objective.color,
          }
        : EMPTY
    );
    editorNonEmptyRef.current = false;
    setActiveDraftId(null);
    setEditorKey((k) => k + 1);
  }, [open, objective]);

  const closeAndReset = () => {
    setForm(EMPTY);
    editorNonEmptyRef.current = false;
    setActiveDraftId(null);
    onOpenChange(false);
  };

  // Typed text is worth keeping — the pickers are two clicks to redo. Only in
  // create mode; editing lives in the side panel now.
  const draftHasContent = () =>
    form.name.trim() !== "" ||
    form.description.trim() !== "" ||
    editorNonEmptyRef.current;

  // Snapshot the form as a local draft (MIN-41), reusing the active id.
  const saveDraft = () => {
    if (!projectId) return;
    drafts.save({
      id: activeDraftId ?? crypto.randomUUID(),
      projectId,
      updatedAt: Date.now(),
      name: form.name,
      description: form.description,
      status: form.status,
      lead_user_id: form.lead_user_id,
      target_date: form.target_date,
      color: form.color,
    });
  };

  // Stash the draft and close (the confirmation's "Close draft" action).
  const saveDraftAndClose = () => {
    saveDraft();
    closeAndReset();
  };

  const handleOpenChange = (next: boolean) => {
    // Swallow close signals while the confirmation owns the decision, and for
    // the brief window right after it closes (the fall-through click).
    if (!next && (confirmClose || ignoreCloseAfterConfirmRef.current)) return;
    // Dismissing a create form with content asks first — confirming keeps it.
    if (!next && draftsEnabled && draftHasContent()) {
      setConfirmClose(true);
      return;
    }
    if (!next) closeAndReset();
    else onOpenChange(next);
  };

  // Arm the fall-through guard the instant the confirmation closes (keep
  // editing, Escape, or after confirming).
  const handleConfirmOpenChange = (openNext: boolean) => {
    setConfirmClose(openNext);
    if (!openNext) {
      ignoreCloseAfterConfirmRef.current = true;
      window.setTimeout(() => {
        ignoreCloseAfterConfirmRef.current = false;
      }, 300);
    }
  };

  // Load a saved draft back into the form and track its id.
  const recoverDraft = (id: string) => {
    const draft = drafts.find(id);
    if (!draft) return;
    setForm({
      name: draft.name,
      description: draft.description,
      status: draft.status,
      lead_user_id: draft.lead_user_id,
      target_date: draft.target_date,
      color: draft.color,
    });
    editorNonEmptyRef.current = draft.description.trim() !== "";
    setEditorKey((k) => k + 1); // remount the editor with the draft's content
    setActiveDraftId(draft.id);
  };

  // `target` is set only when creating in a different project (dropdown item).
  const submit = async (target?: Project) => {
    const name = form.name.trim();
    if (!name) return;
    setSubmitting(true);
    const payload = {
      name,
      description: form.description.trim() || null,
      status: form.status,
      lead_user_id: form.lead_user_id,
      target_date: form.target_date,
      color: form.color,
    };
    const other =
      target && projectId && target.id !== projectId ? target : null;
    try {
      if (objective) {
        await onUpdate(objective.id, payload);
        toast.success(t("updatedToast"));
      } else if (other && onCreateInProject) {
        // Cross-project: the lead references THIS project's members and doesn't
        // exist in the target — only the portable fields travel.
        await onCreateInProject(other.id, {
          name,
          description: form.description.trim() || null,
          status: form.status,
          target_date: form.target_date,
          color: form.color,
        });
        toast.success(t("createdInProjectToast", { project: other.name }));
      } else {
        await onCreate(payload);
        toast.success(t("createdToast"));
      }
      // The draft became a real objective — drop it from the local store.
      if (activeDraftId) drafts.remove(activeDraftId);
      closeAndReset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="p-8 sm:max-w-2xl"
          onInteractOutside={keepOverlayOpenForPopper}
        >
          {/* Titre lecteur d'écran : à l'édition, le nom de l'objectif dit
              mieux de quoi il s'agit qu'un intitulé générique. */}
          <DialogTitle className="sr-only">
            {objective ? objective.name : t("newObjective")}
          </DialogTitle>

          <form onSubmit={handleSubmit} className="relative flex flex-col rounded-lg">
            {/* Recent drafts — a row above the name to restore or delete an
              abandoned draft (MIN-41). Hidden once the form has content. */}
            {draftsEnabled &&
              form.name.trim() === "" &&
              form.description.trim() === "" && (
                <DraftRecoveryRow
                  drafts={drafts.drafts.map((d) => ({ id: d.id, title: d.name }))}
                  onRecover={recoverDraft}
                  onDelete={drafts.remove}
                  className="mb-3"
                />
              )}
            <AutoTextarea
              autoFocus
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void submit();
              }}
              placeholder={t("namePlaceholder")}
              className="w-full overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
            />
            <MarkdownEditor
              key={editorKey}
              value={form.description}
              onCommit={(description) => setForm((f) => ({ ...f, description }))}
              onEmptyChange={(empty) => {
                editorNonEmptyRef.current = !empty;
              }}
              placeholder={t("descriptionPlaceholder")}
              className="mt-2 min-h-16"
            />

            {/* Options — one compact inline row, like the create-issue dialog */}
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <ObjectiveStatusCompact
                value={form.status}
                onChange={(status) => setForm((f) => ({ ...f, status }))}
              />
              <AssigneeCompact
                value={form.lead_user_id}
                onChange={(lead_user_id) => setForm((f) => ({ ...f, lead_user_id }))}
                members={members}
                noneLabel={t("noLead")}
              />
              <DateTimePicker
                variant="field"
                value={form.target_date}
                onChange={(target_date) => setForm((f) => ({ ...f, target_date }))}
                placeholder={t("targetDatePlaceholder")}
                ariaLabel={t("targetDatePlaceholder")}
                tooltip={t("targetDatePlaceholder")}
                className="h-8 rounded-full"
              />
              <ColorCompact
                value={form.color}
                onChange={(color) => setForm((f) => ({ ...f, color }))}
              />
            </div>

            {/* Bottom bar — create controls at right, like the create-issue dialog */}
            <div className="mt-8 flex items-center justify-end gap-4">
              {showSplit ? (
                <SplitButton
                  type="submit"
                  disabled={submitting || !form.name.trim()}
                  actionClassName="rounded-l-full pl-4"
                  triggerClassName="rounded-r-full"
                  menuLabel={t("createInOtherProject")}
                  menu={otherProjects.map((p) => (
                    <DropdownMenuItem key={p.id} onSelect={() => void submit(p)}>
                      <ProjectOrb seed={p.id} iconUrl={p.icon_url} className="size-4" />
                      <span className="truncate">{p.name}</span>
                    </DropdownMenuItem>
                  ))}
                >
                  {submitting && <Spinner />}
                  <span className="max-w-[14rem] truncate">
                    {t("createInProject", { project: currentProject!.name })}
                  </span>
                </SplitButton>
              ) : (
                <Button
                  type="submit"
                  className="rounded-full px-4"
                  disabled={submitting || !form.name.trim()}
                >
                  {submitting && <Spinner />}
                  {objective ? tCommon("save") : tCommon("create")}
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dismissing a non-empty new-objective draft asks first (create only). */}
      <CloseDraftDialog
        open={confirmClose}
        onOpenChange={handleConfirmOpenChange}
        onConfirm={saveDraftAndClose}
      />
    </>
  );
}
