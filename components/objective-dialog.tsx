"use client";

import type { JSONContent } from "@tiptap/core";
import { useRichDocument } from "@/lib/use-rich-document";

import { MobileSheetScrollArea } from "@/components/ui/mobile-sheet";

import { ResponsivePopover, ResponsivePopoverContent, ResponsivePopoverTrigger } from "@/components/ui/responsive-popover";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "@hugeicons/core-free-icons";
import { createUuid } from "@/lib/create-uuid";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AutoTextarea } from "@/components/auto-textarea";
import { CreationRelationPills, CreationRelationsCompact } from "@/components/creation-relations";
// Deferred editor: keeps tiptap (~1.5 MB) out of the objectives route —
// see components/editor/document-editor-lazy.tsx. The dialog mounts with the page, which warms
// the chunk from idle time (hook below).
import {
  DocumentEditorFallback,
  LazyDocumentEditor,
  useIdleDocumentEditorPreload,
} from "@/components/editor/document-editor-lazy";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useResourceMentions } from "@/lib/use-resource-mentions";
import { AssigneeCompact } from "@/components/issue-compact-fields";
import { ObjectiveStatusIndicator } from "@/components/issue-indicators";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { CreationProjectSelect } from "@/components/creation-project-select";
import { useMembersQuery } from "@/lib/use-members-query";
import { useAuth } from "@/lib/auth-context";
import { capabilitiesForProject } from "@/lib/use-project-capabilities";
import { CloseDraftDialog } from "@/components/close-draft-dialog";
import { CreationDictation, CreationProperty } from "@/components/creation-form-layout";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import {
  AddResourceButton,
  ComposerResourcePills,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { landedResources, useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useObjectiveDictation } from "@/lib/use-objective-dictation";
import { useAnalytics } from "@/lib/use-analytics";
import { useDrafts } from "@/lib/use-drafts";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { useSubmitShortcut } from "@/lib/keyboard/use-submit-shortcut";
import { useTitleBodyLink } from "@/lib/use-title-body-link";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_MAP,
  type ObjectiveStatus,
} from "@/lib/objective-constants";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/category-colors";
import type {
  CreateObjectiveInput,
  Member,
  Objective,
  ObjectiveDraftPatch,
  ObjectiveUpdateInput,
  PendingRelationInput,
  Project,
} from "@/lib/types";
import { AppTooltip } from "@/components/ui/app-tooltip";
import {
  OBJECTIVE_KEY_FOR_FIELD,
  useObjectiveFieldShortcuts,
  type ObjectiveShortcutField,
} from "@/components/objective-field-shortcuts";

/** Controlled open state + key badge, driven by the field shortcuts. */
type PickerControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcutHint: string;
};

// Bare (borderless) compact-field trigger — matches issue-compact-fields.tsx so
// the objective dialog's options row reads like the create-issue dialog's.
const BARE =
  "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted max-sm:p-2";

/** Icon + label status picker for the compact options row. */
function ObjectiveStatusCompact({
  value,
  onChange,
  ...control
}: {
  value: ObjectiveStatus;
  onChange: (v: ObjectiveStatus) => void;
} & PickerControl) {
  const t = useTranslations("Objectives");
  const tStatus = useTranslations("ObjectiveStatus");
  const meta = OBJECTIVE_STATUS_MAP[value];
  const options: PickerOption[] = OBJECTIVE_STATUSES.map((s) => {
    return {
      value: s.value,
      label: tStatus(s.value),
      icon: <ObjectiveStatusIndicator status={s.value} className="size-4" />,
    };
  });
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as ObjectiveStatus)}
      options={options}
      tooltip={t("statusFieldLabel")}
      {...control}
      trigger={
        <button type="button" aria-label={t("statusFieldLabel")} className={BARE}>
          <ObjectiveStatusIndicator status={meta.value} className="size-[18px]" />
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
  open,
  onOpenChange: setOpen,
  shortcutHint,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
} & PickerControl) {
  const t = useTranslations("Objectives");
  const tColors = useTranslations("Categories.colors");
  const pick = (c: string | null) => {
    onChange(c);
    setOpen(false);
  };
  return (
    <ResponsivePopover open={open} onOpenChange={setOpen}>
      <AppTooltip label={t("colorFieldLabel")} shortcut={[shortcutHint]}>
        <ResponsivePopoverTrigger asChild>
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
        </ResponsivePopoverTrigger>
      </AppTooltip>
      <ResponsivePopoverContent mobileTitle={t("colorFieldLabel")} align="start" className="w-auto p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <AppTooltip label={t("noColor")}>
            <button
              type="button"
              onClick={() => pick(null)}
              aria-label={t("noColor")}
              className={cn(
                "flex size-6 app-mobile:size-11 items-center justify-center rounded-full border border-border text-[10px] text-muted-foreground",
                value === null && "ring-2 ring-ring ring-offset-2 ring-offset-background"
              )}
            >
              ∅
            </button>
          </AppTooltip>
          {CATEGORY_COLORS.map((c) => (
            <AppTooltip label={t("colorAria", { color: tColors(CATEGORY_COLOR_NAMES[c]) })} key={c}>
              <button
                type="button"
                onClick={() => pick(c)}
                aria-label={t("colorAria", { color: tColors(CATEGORY_COLOR_NAMES[c]) })}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background",
                  value === c && "ring-2 ring-ring"
                )}
                style={{ backgroundColor: c }}
              >
                {value === c && <HugeiconsIcon icon={CheckIcon} className="size-3.5 text-white" />}
              </button>
            </AppTooltip>
          ))}
        </div>
      </ResponsivePopoverContent>
    </ResponsivePopover>
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
  projectKey,
  initialName,
  onCreateInProject,
  initialDraftId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  /** When set, the dialog edits this objective; otherwise it creates one. */
  objective?: Objective | null;
  /** Pre-filled name when opening, in creation: quick addition from an objective picker
 * passes the text already typed in the search. */
  initialName?: string;
  /** A saved draft of `projectId` to restore when the dialog opens — the
      drafts tray's "open" (MIN-753). */
  initialDraftId?: string | null;
  onCreate: (input: CreateObjectiveInput) => Promise<unknown>;
  onUpdate: (id: string, updates: ObjectiveUpdateInput) => Promise<unknown>;
  /** The user's projects — the "Create in" select lists those the viewer can
      write. Without `onCreateInProject`, only `projectId` is offered. */
  projects?: Project[];
  /** The project `onCreate` targets, selected when the dialog opens. */
  projectId?: string;
  /** Identifier prefix when this dialog is mounted without a project menu. */
  projectKey?: string;
  /** Create in another project chosen in the "Create in" select. */
  onCreateInProject?: (
    targetProjectId: string,
    input: CreateObjectiveInput
  ) => Promise<unknown>;
}) {
  const t = useTranslations("Objectives");
  const mobile = useMobileLayout() === true;
  const tField = useTranslations("Field");
  const titleId = useId();
  // Title and description read as one text on the keyboard (MIN-756).
  const titleBody = useTitleBodyLink();
  const tCommon = useTranslations("Common");
  const tDrafts = useTranslations("Drafts");
  const tRelations = useTranslations("Relations");
  const { track } = useAnalytics();
  const { user } = useAuth();
  /**
   * "Create in" (MIN-741): the project the objective lands in, `projectId`
   * when the dialog opens. Drafts, uploads, mentions, dictation, relations and
   * the lead picker follow the selection.
   */
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  useEffect(() => {
    if (open) setSelectedProjectId(projectId);
  }, [open, projectId]);
  const activeProjectId = selectedProjectId ?? projectId;
  const inHomeProject = activeProjectId === projectId;
  const foreignProjectId = open && !inHomeProject ? activeProjectId ?? null : null;
  const foreignMembers = useMembersQuery(foreignProjectId, foreignProjectId !== null).members;
  const scopedMembers = inHomeProject ? members : foreignMembers;
  // Mounts with the objectives page: warm the editor chunk once painted.
  useIdleDocumentEditorPreload();
  const [form, setForm] = useState(EMPTY);
  const [relations, setRelations] = useState<PendingRelationInput[]>([]);
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
  /** The editor document of `form.description`, as last committed (MIN-728);
      cleared whenever the description is replaced from outside the editor. */
  const descriptionDocument = useRef<JSONContent | null>(null);
  // The document of a recovered draft, opened as stored so its pills keep
  // their colors; null for a new description.
  const [draftDocument, setDraftDocument] = useState<JSONContent | null>(null);
  // Images of the description still being sent (MIN-728).
  const [imagesUploading, setImagesUploading] = useState(false);
  // Editing an existing objective opens its stored document, so a save does
  // not drop what Markdown cannot carry.
  const { document: storedDocument, remember: rememberDocument } = useRichDocument(
    "objective",
    objective?.id,
    { enabled: open && !!objective }
  );
  // A take being transcribed (the audio is gone, the text is not
  // income): with the Numo suite, this is the window where closing loses dictation.
  const [transcribing, setTranscribing] = useState(false);
  // ⌘/Ctrl + Enter validates the objective, wherever you are in the form — y
  // understood from the description, which the name field does not cover.
  const submitShortcut = useSubmitShortcut();

  // Field shortcuts (MIN-757): the issue keys S/A/D/R plus C for the color open
  // the matching picker, never while typing in the name or description.
  const contentRef = useRef<HTMLDivElement>(null);
  const [openPicker, setOpenPicker] = useState<ObjectiveShortcutField | null>(null);
  const pickerControl = (field: ObjectiveShortcutField): PickerControl => ({
    open: openPicker === field,
    onOpenChange: (o) => setOpenPicker(o ? field : null),
    shortcutHint: OBJECTIVE_KEY_FOR_FIELD[field],
  });

  // Drafts, resources and voice dictation share the same two conditions: each
  // is project-scoped (the draft store, the storage prefix, the dictation route)
  // and each only makes sense while composing — editing an objective happens in
  // the side panel, whose own attach button and mic write straight to it.
  const composerEnabled = !objective && !!activeProjectId;
  useObjectiveFieldShortcuts({
    enabled: open,
    // Relations are only picked while composing (see `composerEnabled`).
    fields: composerEnabled
      ? ["status", "lead", "targetDate", "color", "relation"]
      : ["status", "lead", "targetDate", "color"],
    onField: setOpenPicker,
    scope: contentRef,
  });
  const drafts = useDrafts("objective", activeProjectId ?? null, open && composerEnabled);
  const uploads = useAttachmentUploads(() => `projects/${activeProjectId ?? ""}`);
  const drop = useFileDrop(uploads.addFiles);
  // The description can cite the resources added in this dialog (MIN-742).
  const mentions = useResourceMentions(
    useDescriptionMentions(activeProjectId ?? null, scopedMembers),
    landedResources(uploads.pending),
  );

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  // Another project is only offered when the caller can create there.
  const selectableProjects = projects.filter((p) =>
    p.id === projectId ||
    (!!onCreateInProject && capabilitiesForProject(p, user?.id).canWrite)
  );

  // The lead and relations belong to one project: a new target starts without.
  const changeProject = (next: string) => {
    if (next === activeProjectId) return;
    setSelectedProjectId(next);
    setForm((f) => ({ ...f, lead_user_id: null }));
    setRelations([]);
    // The recovered draft belongs to the previous project's list.
    setActiveDraftId(null);
  };

  useEffect(() => {
    if (!open) return;
    descriptionDocument.current = null;
    setDraftDocument(null);
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
        : { ...EMPTY, name: initialName ?? "" }
    );
    editorNonEmptyRef.current = false;
    setRelations([]);
    setActiveDraftId(null);
    setEditorKey((k) => k + 1);
  }, [open, objective, initialName, projectId]);

  const closeAndReset = () => {
    setOpenPicker(null);
    descriptionDocument.current = null;
    setDraftDocument(null);
    setSelectedProjectId(projectId);
    setForm(EMPTY);
    setRelations([]);
    editorNonEmptyRef.current = false;
    setActiveDraftId(null);
    uploads.clear();
    resetDictation();
    onOpenChange(false);
  };

  // Typed text or a finished upload is worth keeping — the pickers are two
  // clicks to redo. Only in create mode; editing lives in the side panel now.
  const draftHasContent = () =>
    form.name.trim() !== "" ||
    form.description.trim() !== "" ||
    editorNonEmptyRef.current ||
    uploads.inputs.length > 0 ||
    relations.length > 0;

  // Snapshot the form as a local draft (MIN-41), reusing the active id.
  const saveDraft = async () => {
    if (!activeProjectId) return;
    await drafts.save({
      id: activeDraftId ?? createUuid(),
      projectId: activeProjectId,
      updatedAt: Date.now(),
      name: form.name,
      description: form.description,
      status: form.status,
      lead_user_id: form.lead_user_id,
      target_date: form.target_date,
      color: form.color,
      resources: uploads.inputs,
      relations,
      description_doc: form.description.trim() ? descriptionDocument.current : null,
    });
  };

  // Stash the draft and close (the confirmation's "Save" action).
  const saveDraftAndClose = async () => {
    try { await saveDraft(); closeAndReset(); }
    catch { toast.error(tDrafts("saveFailed")); }
  };

  // “Abandon”: we close WITHOUT keeping, and the original draft goes away
  // with — otherwise we would find in the repeat row the one we thought
  // have given up. Same gesture as successful creation, which also consumes the
  // draft it came from.
  const discardDraftAndClose = async () => {
    if (activeDraftId && !await drafts.remove(activeDraftId)) return;
    closeAndReset();
  };

  const handleOpenChange = (next: boolean) => {
    // An in-flight dictation works ON this form: the transcript, then the
    // Numo patch, will land there. Closing now would throw them away — we
    // refuse, saying so (an Escape without effect would pass for a failure).
    if (!next && (transcribing || numoBusy)) {
      toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
      return;
    }
    // Swallow close signals while the confirmation owns the decision, and for
    // the brief window right after it closes (the fall-through click).
    if (!next && (confirmClose || ignoreCloseAfterConfirmRef.current)) return;
    // Dismissing a create form with content asks first — confirming keeps it.
    if (!next && composerEnabled && draftHasContent()) {
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
    descriptionDocument.current = draft.description_doc ?? null;
    setDraftDocument(draft.description_doc ?? null);
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
    uploads.restore(draft.resources ?? []);
    setRelations(draft.relations ?? []);
    setActiveDraftId(draft.id);
  };

  // The drafts tray opens the form on a saved draft (MIN-753): restored once
  // per opening, as soon as the store has been read.
  const restoredDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { restoredDraftRef.current = null; return; }
    if (!initialDraftId || restoredDraftRef.current === initialDraftId || !drafts.find(initialDraftId)) return;
    restoredDraftRef.current = initialDraftId;
    recoverDraft(initialDraftId);
  }, [open, initialDraftId, drafts.find]);

  const tPages = useTranslations("Pages");
  const submit = async () => {
    const name = form.name.trim();
    if (!name || submitting) return;
    // An image still uploading has no address yet (MIN-728).
    if (imagesUploading) {
      toast.info(tPages("waitForUploads"));
      return;
    }
    setSubmitting(true);
    const payload = {
      name,
      description: form.description.trim() || null,
      ...(form.description.trim() && descriptionDocument.current
        ? { description_doc: descriptionDocument.current }
        : {}),
      status: form.status,
      lead_user_id: form.lead_user_id,
      target_date: form.target_date,
      color: form.color,
    };
    try {
      if (objective) {
        await onUpdate(objective.id, payload);
        if (payload.description_doc) rememberDocument(payload.description_doc);
        toast.success(t("updatedToast"));
      } else if (!inHomeProject && activeProjectId && onCreateInProject) {
        // Another project: the lead and relations were picked among its own
        // members and issues. Files uploaded before the project changed carry
        // the previous prefix, so the server COPIES them into the target.
        await onCreateInProject(activeProjectId, {
          ...payload,
          relations,
          copy_resources: uploads.inputs,
        });
        toast.success(t("createdInProjectToast", { project: activeProject?.name ?? "" }));
      } else {
        await onCreate({ ...payload, resources: uploads.inputs, relations });
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

  // A dictated patch lands in the form like a manual edit would — the objective
  // is only written when the user submits.
  const applyPatch = (patch: ObjectiveDraftPatch) => {
    setForm((f) => ({
      ...f,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.lead_user_id !== undefined
        ? { lead_user_id: patch.lead_user_id }
        : {}),
      ...(patch.target_date !== undefined
        ? { target_date: patch.target_date }
        : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    }));
    if (patch.description !== undefined) {
      descriptionDocument.current = null;
      setDraftDocument(null);
      setEditorKey((k) => k + 1); // remount the editor with the new content
      editorNonEmptyRef.current = patch.description.trim() !== "";
    }
  };

  // Throwaway dictation session — history feeds Numo's follow-up commands and
  // dies with the dialog (nothing persisted).
  const { busy: numoBusy, onTranscript, reset: resetDictation } =
    useObjectiveDictation({
      projectId: activeProjectId ?? "",
      mode: "create",
      getDraft: () => form,
      applyPatch,
    });

  const showProjectSelect = composerEnabled && !!activeProject;
  const projectSelect = (placement: "dialog" | "sheet") => activeProject && (
    <CreationProjectSelect
      projects={selectableProjects}
      value={activeProject.id}
      onChange={changeProject}
      placement={placement}
      disabled={submitting || numoBusy}
    />
  );

  const dictationControl = <CreationDictation mobile={mobile} busy={numoBusy} busyLabel={t("numoWorking")}
    context="objective_form" onTranscription={(text) => { track("objective_dictation_used", { surface: "create_dialog" }); onTranscript(text); }}
    disabled={submitting} shortcutKey="mod+shift+d" onProcessingChange={setTranscribing} />;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          ref={contentRef}
          aria-describedby={undefined}
          // In creation, the extra top padding clears the "Create in" pill and
          // the close button.
          className={cn("creation-sheet p-8 max-sm:p-5 sm:max-w-2xl", showProjectSelect && "pt-15 max-sm:pt-15")}
          onInteractOutside={keepOverlayOpenForPopper}
        >
          {/* Screen reader title: when editing, the name of the objective says
 better what it is than a generic title. */}
          {/* "Create in" (MIN-741): level with the close button on desktop;
              on phones it joins the sheet title instead of adding a row. */}
          {mobile && showProjectSelect ? (
            <div data-mobile-sheet-header className="flex shrink-0 items-center gap-2">
              <DialogTitle className="shrink-0">{t("newObjective")}</DialogTitle>
              {projectSelect("sheet")}
            </div>
          ) : (
            <DialogTitle className={mobile ? "shrink-0 pr-10" : "sr-only"}>
              {objective ? objective.name : t("newObjective")}
            </DialogTitle>
          )}
          {!mobile && showProjectSelect && projectSelect("dialog")}

          <form
            {...submitShortcut}
            onSubmit={handleSubmit}
            className="creation-form relative flex flex-col rounded-lg"
            {...(composerEnabled
              ? { onPaste: pasteFileHandler(uploads.addFiles), ...drop.handlers }
              : {})}
          >
            {composerEnabled && <DropOverlay show={drop.dragging} />}
            <MobileSheetScrollArea className="creation-form-body">
              {/* Resources are context — they sit ABOVE the text being written. */}
              {composerEnabled && (
                <ComposerResourcePills
                  uploads={uploads}
                  className="mb-3"
                />
              )}
              {composerEnabled && (
                <CreationRelationPills
                  projectId={activeProjectId!}
                  projectKey={activeProject?.key ?? projectKey ?? ""}
                  active={open}
                  value={relations}
                  onChange={setRelations}
                  disabled={submitting}
                />
              )}
              <label htmlFor={titleId} className="creation-field-label">{tField("title")}</label>
              <AutoTextarea
                id={titleId}
                enterKeyHint={mobile ? "next" : undefined}
                autoFocus={!mobile}
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                ref={titleBody.titleRef}
                onKeyDown={(e) => {
                  titleBody.onTitleKeyDown(e, { submit: () => void submit(), mobile });
                }}
                placeholder={t("namePlaceholder")}
                className="creation-title w-full overflow-hidden bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50 sm:text-2xl"
              />
              <div className="creation-field-label">{tField("description")}</div>
              <div ref={titleBody.bodyRef}>
              {objective && storedDocument === undefined ? (
                <DocumentEditorFallback
                  value={form.description}
                  className="creation-description mt-2 min-h-16"
                />
              ) : (
              <LazyDocumentEditor
                key={editorKey}
                mentions={mentions}
                onLeaveTop={titleBody.leaveBody}
                value={form.description}
                uploadScope={activeProjectId ? `projects/${activeProjectId}` : null}
                onUploadingChange={setImagesUploading}
                document={objective ? storedDocument : draftDocument}
                onCommit={(description, content) => {
                  descriptionDocument.current = content;
                  setForm((f) => ({ ...f, description }));
                }}
                // An image's address arrives when its upload ends, often
                // after the field lost focus: follow every change too.
                onChange={(description, content) => {
                  descriptionDocument.current = content;
                  setForm((f) => ({ ...f, description }));
                }}
                onEmptyChange={(empty) => {
                  editorNonEmptyRef.current = !empty;
                }}
                placeholder={t("createDescriptionPlaceholder")}
                className="creation-description mt-2 min-h-16"
              />
              )}
              </div>

              {/* Property values stay compact on desktop and receive labels on mobile. */}
              <div className="creation-properties mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <CreationProperty mobile={mobile} label={t("statusFieldLabel")}>
                  <ObjectiveStatusCompact
                    value={form.status}
                    onChange={(status) => setForm((f) => ({ ...f, status }))}
                    {...pickerControl("status")}
                  />
                </CreationProperty>
                <CreationProperty mobile={mobile} label={t("leadFieldLabel")}>
                  <AssigneeCompact
                    showValue={mobile}
                    value={form.lead_user_id}
                    onChange={(lead_user_id) => setForm((f) => ({ ...f, lead_user_id }))}
                    members={scopedMembers}
                    noneLabel={t("noLead")}
                    {...pickerControl("lead")}
                  />
                </CreationProperty>
                <CreationProperty mobile={mobile} label={t("targetDatePlaceholder")}>
                  <DateTimePicker
                    variant="ghost"
                    value={form.target_date}
                    onChange={(target_date) => setForm((f) => ({ ...f, target_date }))}
                    placeholder={t("targetDatePlaceholder")}
                    ariaLabel={t("targetDatePlaceholder")}
                    tooltip={t("targetDatePlaceholder")}
                    {...pickerControl("targetDate")}
                  />
                </CreationProperty>
                <CreationProperty mobile={mobile} label={t("colorFieldLabel")}>
                  <ColorCompact
                    value={form.color}
                    onChange={(color) => setForm((f) => ({ ...f, color }))}
                    {...pickerControl("color")}
                  />
                </CreationProperty>
                {composerEnabled && (
                  <CreationProperty mobile={mobile} label={tRelations("relations")}>
                    <CreationRelationsCompact
                      projectId={activeProjectId!}
                      projectKey={activeProject?.key ?? projectKey ?? ""}
                      active={open}
                      value={relations}
                      onChange={setRelations}
                      disabled={submitting}
                      {...pickerControl("relation")}
                    />
                  </CreationProperty>
                )}
              </div>

            </MobileSheetScrollArea>
            {/* Submission stays visible while the mobile form body scrolls. */}
            <div className="creation-form-footer mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
              {!mobile && composerEnabled && dictationControl}
              {composerEnabled && (
                <AddResourceButton
                  onFiles={uploads.addFiles}
                  onLink={uploads.addLink}
                  onPage={uploads.addPage}
                  projectId={activeProjectId}
                  disabled={submitting}
                />
              )}
              {/* No Cancel button: the dialog's own close X already does
                  that job. */}
              <div className="creation-submit ml-auto flex items-center justify-end gap-2 app-mobile:w-full">
                <SendShortcutTooltip
                  scope="form"
                  label={objective ? tCommon("save") : t("createObjective")}
                >
                  <Button
                    type="submit"
                    className="rounded-full px-4 app-mobile:w-full"
                    disabled={
                      submitting ||
                      numoBusy ||
                      !form.name.trim() ||
                      uploads.uploading
                    }
                  >
                    {submitting && <Spinner />}
                    {objective ? tCommon("save") : t("createObjective")}
                  </Button>
                </SendShortcutTooltip>
                {/* On phones the recorder sits beside the create button. */}
                {mobile && composerEnabled && dictationControl}
              </div>
            </div>
          </form>

          {/* Numo resumes dictation: the border highlights the edge of the modal
 while he works — same signal as the Numo “thinking”
 icon which replaces the microphone higher up. */}
          <AgentBeamOverlay active={numoBusy} />
        </DialogContent>
      </Dialog>

      {/* Dismissing a non-empty new-objective draft asks first (create only). */}
      <CloseDraftDialog
        open={confirmClose}
        onOpenChange={handleConfirmOpenChange}
        onConfirm={saveDraftAndClose}
        onDiscard={discardDraftAndClose}
      />
    </>
  );
}
