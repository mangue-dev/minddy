"use client";

import type { JSONContent } from "@tiptap/core";

import { MobileSheetScrollArea } from "@/components/ui/mobile-sheet";

import { createUuid } from "@/lib/create-uuid";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { SplitButton } from "@/components/ui/split-button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AutoTextarea } from "@/components/auto-textarea";
import { CreationRelationPills, CreationRelationsCompact } from "@/components/creation-relations";
// Deferred editor: keeps tiptap (~1.5 MB) out of every board route's graph —
// see components/editor/document-editor-lazy.tsx. The chunk is warmed from idle time by the
// hook below, so the first open waits on nothing.
import {
  LazyDocumentEditor,
  useIdleDocumentEditorPreload,
} from "@/components/editor/document-editor-lazy";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useResourceMentions } from "@/lib/use-resource-mentions";
import { useArrowField } from "@/lib/use-arrow-field";
import { useTitleBodyLink } from "@/lib/use-title-body-link";
import { CreationDictation, CreationProperty } from "@/components/creation-form-layout";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import {
  AddResourceButton,
  ComposerResourcePills,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { landedResources, useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { CreationProjectSelect } from "@/components/creation-project-select";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { capabilitiesForProject } from "@/lib/use-project-capabilities";
import { nextIssueIdentifier } from "@/lib/issue-constants";
import {
  AssigneeCompact,
  CategoriesCompact,
  DueDateCompact,
  EffortCompact,
  ObjectiveCompact,
  SmartFillCompact,
  PriorityCompact,
  StatusCompact,
} from "@/components/issue-compact-fields";
import {
  KEY_FOR_FIELD,
  RELATION_SHORTCUT_HINT,
  RELATION_SHORTCUT_KEY,
  SHORTCUT_KEYS,
  type ShortcutField,
} from "@/components/issue-field-shortcuts";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { useAuth } from "@/lib/auth-context";
import { useDrafts } from "@/lib/use-drafts";
import { useHeldDraft } from "@/lib/use-held-draft";
import { useIssueDictation } from "@/lib/use-issue-dictation";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";
import { lengthBucket } from "@/lib/analytics-sanitize";
import type { AnalyticsPropsFor } from "@/lib/analytics-events";
import { eventKey } from "@/lib/keyboard/event-key";
import { useSubmitShortcut } from "@/lib/keyboard/use-submit-shortcut";
import type {
  IssueStatus,
  IssuePriority,
  IssueEffort,
} from "@/lib/issue-constants";
import {
  resolveSmartFill,
  resolveSmartFillRelations,
  resolveSmartFillScope,
  resolveSmartFillTitle,
} from "@/lib/smart-fill";
import { smartFillFieldVisible, type SmartFillField } from "@/lib/smart-fill-fields";
import type { RecurrenceCadence } from "@/lib/recurrence";
import type {
  Category,
  CreateIssueInput,
  IssueDraftPatch,
  Member,
  Objective,
  PendingRelationInput,
  Project,
} from "@/lib/types";

const DEFAULTS = {
  status: "backlog" as IssueStatus,
  priority: "none" as IssuePriority,
  effort: null as IssueEffort | null,
  assignee_id: null as string | null,
  objective_id: null as string | null,
  parent_id: null as string | null,
  due_date: null as string | null,
  recurrence: null as RecurrenceCadence | null,
};

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
  initialAssigneeId,
  initialParentId,
  initialTitle,
  initialDescription,
  initialCategoryIds,
  autoDictate = false,
  analyticsSource = "dialog",
  initialDraftId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** All the user's projects — the "Create in" select lists those the
      viewer can write. */
  projects: Project[];
  /** Members, categories and objectives of `projectId`; another selected
      project loads its own. */
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  onCreate: (input: CreateIssueInput) => Promise<unknown>;
  /** Create in another project chosen in the "Create in" select. */
  onCreateInProject: (
    targetProjectId: string,
    input: CreateIssueInput,
  ) => Promise<unknown>;
  /** Preset the status column the issue lands in (e.g. from a column's "+"). */
  initialStatus?: IssueStatus;
  /** Preset the objective (when creating from an objective-filtered board). */
  initialObjectiveId?: string | null;
  /** Preset the parent (when creating from a family-scoped board, so the new
      issue lands IN the family instead of silently next to it). */
  initialParentId?: string | null;
  /** Preset the assignee (when creating from an assignee-filtered board, so
      the new issue doesn't instantly vanish from it). */
  initialAssigneeId?: string | null;
  /**
   * Starting content — the form opens already written. It's the promotion
   * of a return in ticket: everything that the return can say (its title, its
   * text, its categories) is posed, and the human completes the rest rather than
   * to copy what he has in front of him.
   *
   * Unlike the three presets above, it is only applied ONCE
   * by opening: reapplied to each rendering, it would overwrite the keystroke
   * cours.
   */
  initialTitle?: string;
  initialDescription?: string;
  initialCategoryIds?: string[];
  /**
   * Opens the micro form already open: the global shortcut ⌘⇧D does not open
   * not a dialogue that would then have to be dictated, it opens a take
   * of speech. Simply transmitted to the dictation button — it is HE who
   * triggers, when mounted (see `autoStart`).
   */
  autoDictate?: boolean;
  /** Surface where creation comes from — analytics only (MIN-78). */
  analyticsSource?: AnalyticsPropsFor<"issue_created">["source"];
  /** A saved draft of `projectId` to restore when the dialog opens — the
      drafts tray's "open" (MIN-753). */
  initialDraftId?: string | null;
}) {
  const t = useTranslations("IssueUI");
  const mobile = useMobileLayout() === true;
  const tField = useTranslations("Field");
  const tDrafts = useTranslations("Drafts");
  const tRelations = useTranslations("Relations");
  const { user } = useAuth();
  const { track } = useAnalytics();
  // Closing keeps the form; reopening resumes it (MIN-776). Declared before
  // the opening effects below, which leave a resumed form as it was.
  const resuming = useHeldDraft({
    open,
    context: [projectId, initialDraftId, initialTitle, initialDescription].join("\n"),
    hasContent: () => draftHasContent(),
    save: () => saveDraft(),
    clear: () => reset(),
    onLost: () => toast.error(tDrafts("autoSaveFailed")),
  });
  /**
   * "Create in" (MIN-741): the project the issue lands in, `projectId` when the
   * dialog opens. Everything project-scoped follows the selection — pickers,
   * drafts, mentions, relation search, dictation and the upload prefix.
   */
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  // The project a resumed form was left in; presets reapply once it changes.
  const resumedProjectRef = useRef<string | null>(null);
  // A resumed form takes the caret at the end of its description, where the
  // writing stopped, instead of the start of the title.
  const [focusDescription, setFocusDescription] = useState(false);
  useEffect(() => {
    if (!open) return;
    if (resuming.current) {
      resumedProjectRef.current = selectedProjectId;
      // The editor remounts on the description as last written.
      setDraftDocument(descriptionDocument.current);
      setFocusDescription(true);
      setEditorKey((k) => k + 1);
      return;
    }
    resumedProjectRef.current = null;
    setFocusDescription(false);
    setSelectedProjectId(projectId);
  }, [open, projectId]);
  const activeProjectId = selectedProjectId;
  const inHomeProject = activeProjectId === projectId;
  // The opening project's data comes from the caller; another one loads here.
  const foreignProjectId = open && !inHomeProject ? activeProjectId : null;
  const foreignMembers = useMembersQuery(foreignProjectId, foreignProjectId !== null).members;
  const foreignCategories = useCategoriesQuery(foreignProjectId).categories;
  const foreignObjectives = useObjectivesQuery(foreignProjectId).objectives;
  const scopedMembers = inHomeProject ? members : foreignMembers;
  const scopedCategories = inHomeProject ? categories : foreignCategories;
  const scopedObjectives = inHomeProject ? objectives : foreignObjectives;
  const [title, setTitle] = useState("");
  const [titleFocused, setTitleFocused] = useState(false);
  const [description, setDescription] = useState("");
  /** The editor document of `description`, as last committed (MIN-728);
      cleared whenever the description is replaced from outside the editor. */
  const descriptionDocument = useRef<JSONContent | null>(null);
  // The document of a recovered draft, opened as stored so its pills keep
  // their colors; null for a new description.
  const [draftDocument, setDraftDocument] = useState<JSONContent | null>(null);
  // Images of the description still being sent (MIN-728).
  const [imagesUploading, setImagesUploading] = useState(false);
  const [fields, setFields] = useState(DEFAULTS);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [relations, setRelations] = useState<PendingRelationInput[]>([]);
  // Relations and categories belong to one project: a new target starts empty.
  useEffect(() => {
    setRelations([]);
    setCategoryIds([]);
  }, [activeProjectId]);
  const [createMore, setCreateMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Which field picker a keyboard shortcut (S/P/E/A/L/D/O) has opened, if any.
  // A field picker, or the relations picker that R opens (MIN-749).
  const [openPicker, setOpenPicker] = useState<ShortcutField | "relation" | null>(null);
  // Id of the draft currently loaded in the form (MIN-41): set when a draft is
  // recovered or saved, so saving again updates it in place rather than
  // spawning a copy, and a successful create removes exactly that draft.
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  // A take being transcribed (the audio is gone, the text is not
  // income): with the Numo suite, this is the window where closing loses dictation.
  const [transcribing, setTranscribing] = useState(false);
  // Remount the markdown editor to swap its content (it only commits on blur).
  const [editorKey, setEditorKey] = useState(0);
  // Live emptiness of the editor — `description` alone would miss text that was
  // typed but not yet committed (commit happens on blur) when the dialog closes.
  const editorNonEmptyRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // “->” becomes “→” while typing, like in the body editor.
  const arrowTitle = useArrowField(titleRef);
  // Title and description read as one text on the keyboard (MIN-756).
  const titleBody = useTitleBodyLink(titleRef);
  // The content of the dialog, to know if the keyboard still belongs to him: a
  // second dialog on top (draft confirmation, objective creation
  // from the picker) must keep his touches to himself.
  const contentRef = useRef<HTMLDivElement>(null);
  const createMoreId = useId();
  const titleId = useId();
  // ⌘/Ctrl + Enter creates the ticket, from wherever you are in the form — y
  // understood from the description, which the title field does not cover.
  const submitShortcut = useSubmitShortcut();
  const uploads = useAttachmentUploads(() => `projects/${activeProjectId}`);
  const drop = useFileDrop(uploads.addFiles);
  const drafts = useDrafts("issue", activeProjectId, open);
  // The description can cite the resources added in this dialog (MIN-742).
  const mentions = useResourceMentions(
    useDescriptionMentions(activeProjectId, scopedMembers),
    landedResources(uploads.pending),
  );
  // This dialog mounts with its board: warm the editor chunk once the page
  // has painted, so opening the form never shows the loading fallback.
  useIdleDocumentEditorPreload();

  /**
   * SMART-FILL (MIN-260) — armed by the count, guilty by the ticket.
   *
   * `smartFillAvailable` decides if the toggle EXISTS: preference cut in
   * the settings, it does not appear anywhere and the row of options remains
   * whole. `smartFill` is its state for THIS ticket, reset each time it is opened
   * — cutting Smart-fill on one ticket does not cut it for the next one, it is a
   * one-off gesture, not a disguised adjustment.
   *
   * When active, the row only keeps the three properties that
   * Smart-fill does not touch — status, assigned, due date. The other four
   * are not grayed out but REMOVED: a visible and empty field, on a form
   * where something is going to fill it, reads like an oversight. One comes
   * back while its shortcut has its picker open, and stays once it holds a
   * value set by hand, which Smart-fill then leaves alone (MIN-746).
   */
  const smartFillAvailable = resolveSmartFill(user?.user_metadata);
  // Smart Fill links relations only when the account lets it (MIN-717):
  // with "Link related issues" off, relations stay a manual field.
  const smartFillLinksRelations = resolveSmartFillRelations(user?.user_metadata);
  const smartFillDefault = resolveSmartFillScope(
    user?.user_metadata,
    (initialStatus ?? DEFAULTS.status) === "triage" ? "triage" : "created",
  );
  const smartFillTouchedRef = useRef(false);
  const [smartFill, setSmartFill] = useState(smartFillDefault);
  /**
   * SMART FILL TITLE (MIN-798): unless the account turned it off, and while
   * Smart Fill is on for this issue, the title may stay empty and the server
   * writes it from the description. The title field stays where it is,
   * editable as always; what changes says where to write without a tutorial:
   * the caret opens in the description, the empty title shrinks so the
   * description carries the form (it regains its size once focused or
   * filled), both placeholders say who writes the title, and Create works
   * with a description alone.
   */
  const writesTitle = smartFill && resolveSmartFillTitle(user?.user_metadata);
  const titleRecedes = writesTitle && !titleFocused && title.trim() === "";
  const hasDescription = description.trim() !== "";
  const canSubmitText = title.trim() !== "" || (writesTitle && hasDescription);
  const showsField = (field: SmartFillField) =>
    smartFillFieldVisible(field, {
      smartFill,
      openPicker,
      values: {
        priority: fields.priority,
        effort: fields.effort,
        categoryIds,
        objectiveId: fields.objective_id,
      },
    });
  useEffect(() => {
    if (open && !resuming.current) {
      smartFillTouchedRef.current = false;
      setSmartFill(smartFillDefault);
    }
  }, [open, smartFillDefault]);
  useEffect(() => {
    if (!open || smartFillTouchedRef.current) return;
    setSmartFill(
      resolveSmartFillScope(
        user?.user_metadata,
        fields.status === "triage" ? "triage" : "created",
      ),
    );
  }, [open, fields.status, user]);

  // Account preference (Preferences → auto-assign): pre-fill the assignee
  // with the creator. Guarded on membership — the assignee picker only lists
  // this project's members, so only seed when the user actually belongs here.
  const defaultAssigneeId =
    user?.user_metadata?.auto_assign_created === true &&
    scopedMembers.some((m) => m.user_id === user.id)
      ? user.id
      : DEFAULTS.assignee_id;

  // The project-scoped presets: the caller's objective, parent and assignee
  // describe the board it opened from, so they only hold in that project.
  const scopedPresets = {
    objective_id: inHomeProject ? initialObjectiveId ?? DEFAULTS.objective_id : null,
    parent_id: inHomeProject ? initialParentId ?? DEFAULTS.parent_id : null,
    assignee_id: (inHomeProject ? initialAssigneeId : null) ?? defaultAssigneeId,
  };

  // The field values a freshly-opened dialog starts from: base defaults plus the
  // same presets the open effects apply (column status, objective, auto-assign).
  // Used both to seed on open and to reset after a "create more" submit.
  const freshFields = () => ({
    ...DEFAULTS,
    status: initialStatus ?? DEFAULTS.status,
    ...scopedPresets,
  });

  // Apply the presets each time the dialog opens (a column's "+" reopens it with
  // that column's status; objective mode reopens it with the objective set;
  // family mode reopens it under the active parent; the auto-assign
  // preference seeds the assignee).
  useEffect(() => {
    if (!open || resuming.current) return;
    setFields((f) => ({ ...f, status: initialStatus ?? DEFAULTS.status }));
  }, [open, initialStatus]);
  // Changing the "Create in" project resets the project-scoped fields to that
  // project's presets. Re-seeding on defaultAssigneeId also covers members
  // loading in after the dialog opens or the project changes.
  const { objective_id: presetObjectiveId, parent_id: presetParentId, assignee_id: presetAssigneeId } = scopedPresets;
  useEffect(() => {
    // A resumed form keeps its own values until its project changes.
    if (!open || (resuming.current && resumedProjectRef.current === activeProjectId)) return;
    resumedProjectRef.current = null;
    setFields((f) => ({
      ...f,
      objective_id: presetObjectiveId,
      parent_id: presetParentId,
      assignee_id: presetAssigneeId,
    }));
  }, [open, presetObjectiveId, presetParentId, presetAssigneeId, activeProjectId]);

  // The starting content, placed ONCE per opening. The flag is a ref and
  // not an effect dependency: `initialCategoryIds` is an array, therefore a
  // new identity with each rendering of the parent, and without this safeguard each rendering
  // would rewrite the title over what we are currently typing.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    // A resumed form already holds its seed and what was written over it.
    if (resuming.current) return;
    if (initialTitle) setTitle(initialTitle);
    if (initialDescription) {
      setDescription(initialDescription);
      descriptionDocument.current = null;
      setDraftDocument(null);
      editorNonEmptyRef.current = true;
      setEditorKey((k) => k + 1); // remount the editor with the seeded content
    }
    if (initialCategoryIds?.length) setCategoryIds(initialCategoryIds);
  }, [open, initialTitle, initialDescription, initialCategoryIds]);

  // Opening by voice: armed when opened, DISARMED as soon as the socket is released.
  // Disarmament is not an empty precaution — while Numo resumes
  // dictation, the button gives way to the “thinking” icon and is disassembled;
  // it goes back up when Numo has finished, and a flag left raised would
  // re-record immediately after the ticket that has just been dictated.
  const [dictateArmed, setDictateArmed] = useState(false);
  useEffect(() => {
    setDictateArmed(open && autoDictate);
  }, [open, autoDictate]);

  // Opening the dialog (MIN-78): the denominator of the abandonment rate — how much
  // of opened dialogs end up in a ticket actually created. `useTrackView`
  // guarantees a single emission per opening (StrictMode doubles the effects).
  useTrackView(open, "opened", () =>
    track("issue_create_dialog_opened", { source: analyticsSource })
  );

  // Field shortcuts: while the dialog is open, S/P/E/A/L/D/O open the matching
  // picker (anchored on its trigger in the options row), reusing the board-card
  // mapping, and R the relations picker. Guarded like the dictation shortcut — no modifiers, no key-repeat,
  // and never while typing in the title / description (the keys type normally
  // there; blur the field first to reach the shortcuts). `v` (dictation) and
  // `c` (quick-create) are handled elsewhere and absent from SHORTCUT_KEYS.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      // A dialog stacked on top (the objective picker opens that of
      // creation of objective) traps the focus at home: without this safeguard, a
      // button pressed up there would open a picker BEHIND it. Poppers
      // portalized (the pickers themselves) are outside the content of the dialog, but
      // their search field is an INPUT — already discarded just above.
      if (contentRef.current && el && !contentRef.current.contains(el)) return;
      const key = eventKey(e);
      const field = key === RELATION_SHORTCUT_KEY ? "relation" : SHORTCUT_KEYS[key];
      if (!field) return;
      e.preventDefault();
      setOpenPicker(field);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const clearContent = () => {
    setFocusDescription(false);
    setTitle("");
    setDescription("");
    descriptionDocument.current = null;
    setDraftDocument(null);
    setEditorKey((k) => k + 1);
    uploads.clear();
    setRelations([]);
  };

  const reset = () => {
    clearContent();
    setSelectedProjectId(projectId);
    setFields(DEFAULTS);
    setCategoryIds([]);
    setCreateMore(false);
    setOpenPicker(null);
    setActiveDraftId(null);
    editorNonEmptyRef.current = false;
    resetDictation();
  };

  const closeAndReset = () => {
    reset();
    onOpenChange(false);
  };

  // Typed text or a finished upload is worth keeping — a pristine (or
  // still-uploading-only) form is not.
  const draftHasContent = () =>
    title.trim() !== "" ||
    description.trim() !== "" ||
    editorNonEmptyRef.current ||
    uploads.inputs.length > 0 ||
    relations.length > 0;

  // Snapshot the form as a draft (MIN-41) — reuses the active id so saving a
  // recovered draft again updates it in place instead of piling up copies.
  const saveDraft = async () => {
    const id = activeDraftId ?? createUuid();
    setActiveDraftId(id);
    await drafts.save({
      id,
      projectId: activeProjectId,
      updatedAt: Date.now(),
      title,
      description,
      status: fields.status,
      priority: fields.priority,
      effort: fields.effort,
      assignee_id: fields.assignee_id,
      objective_id: fields.objective_id,
      due_date: fields.due_date,
      recurrence: fields.recurrence,
      category_ids: categoryIds,
      resources: uploads.inputs,
      relations,
      description_doc: description.trim() ? descriptionDocument.current : null,
    });
  };

  // The split menu's "Save as draft" (MIN-776): stash the form and close.
  const saveDraftAndClose = async () => {
    if (!draftHasContent()) return;
    try {
      await saveDraft();
      toast.success(tDrafts("saved"));
      closeAndReset();
    } catch {
      toast.error(tDrafts("saveFailed"));
    }
  };

  const handleOpenChange = (next: boolean) => {
    // An in-flight dictation works ON this form: the transcript, then the
    // patch of Numo, will land there. Closing now would throw them away — we
    // refuses, saying so (an Escape without effect would pass for a failure).
    if (!next && (transcribing || numoBusy)) {
      toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
      return;
    }
    // A form with content stays as it is, for the next opening or the
    // automatic draft (see useHeldDraft); a blank one starts over.
    if (!next && !draftHasContent()) reset();
    if (!next) setOpenPicker(null);
    onOpenChange(next);
  };

  // Load a saved draft back into the form and remember its id so a create /
  // re-close targets the same entry.
  const recoverDraft = (id: string) => {
    const draft = drafts.find(id);
    if (!draft) return;
    track("issue_draft_recovered", {});
    setTitle(draft.title);
    setDescription(draft.description);
    descriptionDocument.current = draft.description_doc ?? null;
    setDraftDocument(draft.description_doc ?? null);
    setEditorKey((k) => k + 1); // remount the editor with the draft's content
    editorNonEmptyRef.current = draft.description.trim() !== "";
    setFields({
      status: draft.status,
      priority: draft.priority,
      effort: draft.effort,
      assignee_id: draft.assignee_id,
      objective_id: draft.objective_id,
      // Drafts never recorded a parent: the dialog's own preset reasserts
      // itself, so a draft recovered on a family board still lands there.
      parent_id: presetParentId,
      due_date: draft.due_date,
      recurrence: draft.recurrence ?? null,
    });
    setCategoryIds(draft.category_ids);
    uploads.restore(draft.resources);
    setRelations(draft.relations ?? []);
    setActiveDraftId(draft.id);
  };

  // The drafts tray opens the form on a saved draft (MIN-753): restored once
  // per opening, as soon as the store has been read.
  const restoredDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { restoredDraftRef.current = null; return; }
    // A resumed form is newer than the stored copy of its draft.
    if (resuming.current) return;
    if (!initialDraftId || restoredDraftRef.current === initialDraftId || !drafts.find(initialDraftId)) return;
    restoredDraftRef.current = initialDraftId;
    recoverDraft(initialDraftId);
  }, [open, initialDraftId, drafts.find]);

  const tPages = useTranslations("Pages");
  const writableProjects = projects.filter(
    (p) => p.id === projectId || capabilitiesForProject(p, user?.id).canWrite
  );
  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
  // The identifier the issue will receive (MIN-741): the project's counter
  // follows every reservation through realtime, so it stays current while
  // issues are created elsewhere.
  const nextIdentifier = activeProject ? nextIssueIdentifier(activeProject) : null;

  const changeProject = (next: string) => {
    if (next === activeProjectId) return;
    setSelectedProjectId(next);
    setOpenPicker(null);
    // The recovered draft belongs to the previous project's list.
    setActiveDraftId(null);
  };

  // `copyIdentifier`: the split menu's "Create and copy" — written while the
  // click still counts as a user gesture, before the request is awaited.
  const submit = async (keepOpen: boolean, copyIdentifier = false) => {
    const trimmed = title.trim();
    if (!canSubmitText || submitting) return;
    // An image still uploading has no address yet (MIN-728).
    if (imagesUploading) {
      toast.info(tPages("waitForUploads"));
      return;
    }
    const identifier = copyIdentifier ? nextIdentifier : null;
    if (identifier) {
      void navigator.clipboard.writeText(identifier).catch(() => {
        toast.error(t("copyIdentifierFailed"));
      });
    }
    setSubmitting(true);
    try {
      const input: CreateIssueInput = {
        title: trimmed,
        description: description.trim() || null,
        ...(description.trim() && descriptionDocument.current
          ? { description_doc: descriptionDocument.current }
          : {}),
        ...fields,
        category_ids: categoryIds,
        relations,
        smart_fill: smartFill,
      };
      if (inHomeProject) {
        await onCreate({ ...input, resources: uploads.inputs });
      } else {
        // Files uploaded before the project changed carry the previous
        // project's storage prefix: the server copies them into the target
        // (and drops pages that do not belong there, MIN-275). Assignee,
        // objective and categories come from the target's own pickers and are
        // validated against it server-side.
        await onCreateInProject(activeProjectId, { ...input, copy_resources: uploads.inputs });
      }
      // Smart-fill: the card is not yet there (the server fills before
      // inserting), and the toast is the only thing that says it's coming.
      // Without it, we close a form on a board that has not moved.
      toast.success(
        smartFill
          ? t("smartFillPendingToast")
          : identifier
            ? t("issueCreatedCopiedToast", { identifier })
            : inHomeProject
              ? t("issueCreatedToast")
              : t("issueCreatedInProjectToast", { project: activeProject?.name ?? "" }),
      );
      // Analytics (MIN-78): metadata only — never the title or the
      // description, only their presence and the length range.
      track("issue_created", {
        source: analyticsSource,
        has_description: description.trim().length > 0,
        has_categories: categoryIds.length > 0,
        has_assignee: fields.assignee_id !== null,
        priority: fields.priority,
        status: fields.status,
        effort: fields.effort,
        cross_project: !inHomeProject,
        resource_count: uploads.inputs.length,
        description_length_bucket: lengthBucket(description),
        created_from_draft: activeDraftId !== null,
        smart_fill: smartFill,
      });
      // The draft became a real issue — drop it from the local store (MIN-41).
      if (activeDraftId) {
        drafts.remove(activeDraftId);
        setActiveDraftId(null);
      }
      // The dictation session is about the issue that was just created — a
      // follow-up recording starts fresh.
      clearDictationHistory();
      if (keepOpen) {
        // Rapid entry: reset the whole draft to a blank slate (title, description
        // AND every property), exactly as if the dialog had just been reopened —
        // in the project just used.
        clearContent();
        setFields(freshFields());
        smartFillTouchedRef.current = false;
        setSmartFill(smartFillDefault);
        setCategoryIds([]);
        setOpenPicker(null);
        // The remounted description editor takes the caret itself when
        // Smart Fill writes the title.
        if (!writesTitle) titleRef.current?.focus();
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

  const applyPatch = (patch: IssueDraftPatch) => {
    if (typeof patch.title === "string") setTitle(patch.title);
    if (typeof patch.description === "string") {
      setFocusDescription(false);
      setDescription(patch.description);
      descriptionDocument.current = null;
      setDraftDocument(null);
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
      ...(patch.due_date !== undefined ? { due_date: patch.due_date } : {}),
    }));
    if (Array.isArray(patch.category_ids)) setCategoryIds(patch.category_ids);
  };

  // Throwaway dictation session — history feeds Numo's follow-up commands and
  // dies with the dialog (nothing persisted).
  const {
    busy: numoBusy,
    onTranscript,
    clearHistory: clearDictationHistory,
    reset: resetDictation,
  } = useIssueDictation({
    projectId: activeProjectId,
    mode: "create",
    // Armed smart-fill: dictation no longer poses priority, effort, categories or
    // objective — the route removes these arguments from its tool, and it is Smart-fill
    // who will pose them to creation (MIN-260). Without that, a dictation would fill
    // fields that the form no longer shows, and which gained on
    // automation that we thought was armed.
    smartFill,
    getDraft: () => ({
      title,
      description,
      ...fields,
      category_ids: categoryIds,
    }),
    applyPatch,
  });

  // The destination decides which members, categories, objectives and
  // relations the rest of the form offers.
  const projectSelect = (placement: "dialog" | "sheet") => (
    <CreationProjectSelect
      projects={writableProjects}
      value={activeProjectId}
      onChange={changeProject}
      placement={placement}
      disabled={submitting || numoBusy}
    />
  );

  const createLabel = nextIdentifier
    ? t("createIdentifier", { identifier: nextIdentifier })
    : t("createTicket");
  const createDisabled = submitting || numoBusy || !canSubmitText || uploads.uploading;
  // A draft keeps finished uploads only, so it waits for those in flight.
  const saveDraftDisabled = submitting || numoBusy || uploads.uploading || !draftHasContent();

  const dictationControl = <CreationDictation mobile={mobile} busy={numoBusy} busyLabel={t("numoWorking")}
    context="issue_form" onTranscription={(text) => { track("issue_dictation_used", { surface: "create_dialog" }); onTranscript(text); }}
    disabled={submitting} shortcutKey="mod+shift+d" onProcessingChange={setTranscribing}
    autoStart={dictateArmed} onAutoStart={() => setDictateArmed(false)} />;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          ref={contentRef}
          onKeyDownCapture={submitShortcut.onKeyDownCapture}
          aria-describedby={undefined}
          // The extra top padding clears the "Create in" pill and the close button.
          className="creation-sheet p-8 pt-15 max-sm:p-5 max-sm:pt-15 sm:max-w-2xl"
          onInteractOutside={keepOverlayOpenForPopper}
        >
          {/* "Create in" (MIN-741): level with the close button on desktop;
              on phones it joins the sheet title instead of adding a row. */}
          {mobile ? (
            <div data-mobile-sheet-header className="flex shrink-0 items-center gap-2">
              <DialogTitle className="shrink-0">{t("newIssueTitle")}</DialogTitle>
              {projectSelect("sheet")}
            </div>
          ) : (
            <>
              <DialogTitle className="sr-only">{t("newIssueTitle")}</DialogTitle>
              {projectSelect("dialog")}
            </>
          )}

          <form
            ref={submitShortcut.ref}
            onSubmit={(e) => {
              e.preventDefault();
              void submit(createMore);
            }}
            className="creation-form relative flex flex-col rounded-lg"
            onPaste={pasteFileHandler(uploads.addFiles)}
            {...drop.handlers}
          >
            <DropOverlay show={drop.dragging} />
            <MobileSheetScrollArea className="creation-form-body">
              {/* Resources are context — they sit ABOVE the text being written. */}
              <ComposerResourcePills
                uploads={uploads}
                className="mb-3"
              />
              <CreationRelationPills
                projectId={activeProjectId}
                projectKey={activeProject?.key ?? ""}
                active={open}
                value={relations}
                onChange={setRelations}
                disabled={submitting}
              />
              <label htmlFor={titleId} className="creation-field-label">{tField("title")}</label>
              <AutoTextarea
                id={titleId}
                ref={arrowTitle.ref}
                enterKeyHint={mobile ? "next" : undefined}
                autoFocus={!mobile && !focusDescription && !writesTitle}
                required={!writesTitle}
                value={title}
                onChange={(e) => setTitle(arrowTitle.read(e))}
                onFocus={() => setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                onKeyDown={(e) => {
                  titleBody.onTitleKeyDown(e, { submit: () => void submit(createMore), mobile });
                }}
                placeholder={writesTitle ? t("titlePlaceholderSmartFill") : t("titlePlaceholder")}
                data-recedes={titleRecedes || undefined}
                className={cn(
                  "creation-title w-full title-field bg-transparent text-xl leading-tight font-semibold outline-none sm:text-2xl",
                  titleRecedes ? "placeholder:text-muted-foreground/30" : "placeholder:text-muted-foreground/50",
                )}
              />
              <div className="creation-field-label">{tField("description")}</div>
              <div ref={titleBody.bodyRef}>
              <LazyDocumentEditor
                mentions={mentions}
                key={editorKey}
                onLeaveTop={titleBody.leaveBody}
                autoFocus={focusDescription || (!mobile && writesTitle)}
                value={description}
                document={draftDocument}
                uploadScope={`projects/${activeProjectId}`}
                onUploadingChange={setImagesUploading}
                onCommit={(markdown, content) => {
                  setDescription(markdown);
                  descriptionDocument.current = content;
                }}
                // An image's address arrives when its upload ends, often
                // after the field lost focus: follow every change too.
                onChange={(markdown, content) => {
                  setDescription(markdown);
                  descriptionDocument.current = content;
                }}
                onEmptyChange={(empty) => {
                  editorNonEmptyRef.current = !empty;
                }}
                placeholder={
                  writesTitle
                    ? t("createDescriptionPlaceholderSmartFill")
                    : t("createDescriptionPlaceholder")
                }
                className="creation-description mt-2 min-h-16"
              />
              </div>

              {/* Property values stay compact on desktop and receive labels on mobile. */}
              <div className="creation-properties mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <CreationProperty mobile={mobile} label={tField("status")}>
                  <StatusCompact
                    showValue={mobile}
                    value={fields.status}
                    onChange={(status) => setFields((f) => ({ ...f, status }))}
                    open={openPicker === "status"}
                    onOpenChange={(o) => setOpenPicker(o ? "status" : null)}
                    shortcutHint={KEY_FOR_FIELD.status}
                  />
                </CreationProperty>
                {/* Smart Fill provides these values when enabled, unless one
                    is set by hand: its shortcut opens the picker (MIN-746). */}
                {showsField("priority") && (
                  <CreationProperty mobile={mobile} label={tField("priority")}>
                    <PriorityCompact
                      showValue={mobile}
                      value={fields.priority}
                      onChange={(priority) => setFields((f) => ({ ...f, priority }))}
                      open={openPicker === "priority"}
                      onOpenChange={(o) => setOpenPicker(o ? "priority" : null)}
                      shortcutHint={KEY_FOR_FIELD.priority}
                    />
                  </CreationProperty>
                )}
                {showsField("effort") && (
                  <CreationProperty mobile={mobile} label={tField("effort")}>
                    <EffortCompact
                      showValue={mobile}
                      value={fields.effort}
                      onChange={(effort) => setFields((f) => ({ ...f, effort }))}
                      open={openPicker === "effort"}
                      onOpenChange={(o) => setOpenPicker(o ? "effort" : null)}
                      shortcutHint={KEY_FOR_FIELD.effort}
                    />
                  </CreationProperty>
                )}
                {showsField("category") && (
                  <CreationProperty mobile={mobile} label={tField("categories")}>
                    <CategoriesCompact
                      showValue={mobile}
                      categories={scopedCategories}
                      projectId={activeProjectId}
                      value={categoryIds}
                      onChange={setCategoryIds}
                      open={openPicker === "category"}
                      onOpenChange={(o) => setOpenPicker(o ? "category" : null)}
                      shortcutHint={KEY_FOR_FIELD.category}
                    />
                  </CreationProperty>
                )}
                <CreationProperty mobile={mobile} label={tField("assignee")}>
                  <AssigneeCompact
                    showValue={mobile}
                    value={fields.assignee_id}
                    onChange={(assignee_id) =>
                      setFields((f) => ({ ...f, assignee_id }))
                    }
                    members={scopedMembers}
                    open={openPicker === "assignee"}
                    onOpenChange={(o) => setOpenPicker(o ? "assignee" : null)}
                    shortcutHint={KEY_FOR_FIELD.assignee}
                  />
                </CreationProperty>
                <CreationProperty mobile={mobile} label={tField("dueDate")}>
                  <DueDateCompact
                    value={fields.due_date}
                    onChange={(due_date) => setFields((f) => ({ ...f, due_date }))}
                    recurrence={fields.recurrence}
                    onRecurrenceChange={(next) => setFields((f) => ({ ...f, ...next }))}
                    open={openPicker === "dueDate"}
                    onOpenChange={(o) => setOpenPicker(o ? "dueDate" : null)}
                    shortcutHint={KEY_FOR_FIELD.dueDate}
                  />
                </CreationProperty>
                {/* Smart Fill also chooses the objective, unless one is set. */}
                {showsField("objective") && (
                  <CreationProperty mobile={mobile} label={tField("objective")}>
                    <ObjectiveCompact
                      showValue={mobile}
                      value={fields.objective_id}
                      onChange={(objective_id) =>
                        setFields((f) => ({ ...f, objective_id }))
                      }
                      objectives={scopedObjectives}
                      projectId={activeProjectId}
                      open={openPicker === "objective"}
                      onOpenChange={(o) => setOpenPicker(o ? "objective" : null)}
                      shortcutHint={KEY_FOR_FIELD.objective}
                    />
                  </CreationProperty>
                )}
                {/* Smart Fill also links related issues after the save (MIN-717):
                    the picker leaves with the other inferred fields, unless the
                    account turned relation linking off or R opened it. Relations already
                    chosen stay visible as pills above the title. */}
                {(!(smartFill && smartFillLinksRelations) || openPicker === "relation") && (
                  <CreationProperty mobile={mobile} label={tRelations("relations")}>
                    <CreationRelationsCompact
                      projectId={activeProjectId}
                      projectKey={activeProject?.key ?? ""}
                      active={open}
                      value={relations}
                      onChange={setRelations}
                      disabled={submitting}
                      open={openPicker === "relation"}
                      onOpenChange={(o) => setOpenPicker(o ? "relation" : null)}
                      shortcutHint={RELATION_SHORTCUT_HINT}
                    />
                  </CreationProperty>
                )}
                {smartFillAvailable && (
                  <SmartFillCompact
                      fullWidth={mobile}
                      writesTitle={resolveSmartFillTitle(user?.user_metadata)}
                      value={smartFill}
                      onChange={(value) => {
                        smartFillTouchedRef.current = true;
                        setSmartFill(value);
                      }}
                    />
                )}
              </div>

            </MobileSheetScrollArea>
            {/* Submission stays visible while the mobile form body scrolls. */}
            <div className="creation-form-footer mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
              {!mobile && dictationControl}
              {/* The proposed wiki is that of the selected project. Pages cited
                  before switching project are discarded by the server when they
                  do not belong to the arrival project (MIN-275). */}
              <AddResourceButton
                onFiles={uploads.addFiles}
                onLink={uploads.addLink}
                onPage={uploads.addPage}
                projectId={activeProjectId}
                disabled={submitting}
              />
              <div className="ml-auto flex items-center gap-4">
                <label
                  htmlFor={createMoreId}
                  className="text-sm text-foreground"
                >
                  {t("createMore")}
                </label>
                <Switch
                  id={createMoreId}
                  checked={createMore}
                  onCheckedChange={setCreateMore}
                />
              </div>
              {/* The button in its own block: it is he who switches to a
  line, full width, when the bar passes the line. No Cancel button:
  the dialog's own close X already does that job. */}
              <div className="creation-submit flex items-center justify-end gap-2 app-mobile:w-full app-desktop:ml-1">
                {/* The tooltip clings to the action, not the chevron: its
                    props pass through `SplitButton` to the left button, the
                    only one that ⌘↵ activates. */}
                <SendShortcutTooltip scope="form" label={createLabel}>
                  <SplitButton
                    type="submit"
                    disabled={createDisabled}
                    menuDisabled={createDisabled && saveDraftDisabled}
                    className="app-mobile:w-full"
                    actionClassName="app-mobile:flex-1"
                    menuLabel={t("moreCreateOptions")}
                    menu={
                      <>
                        {nextIdentifier && (
                          <DropdownMenuItem
                            disabled={createDisabled}
                            onSelect={() => void submit(createMore, true)}
                          >
                            {t("createAndCopyIdentifier", { identifier: nextIdentifier })}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          disabled={saveDraftDisabled}
                          onSelect={() => void saveDraftAndClose()}
                        >
                          {tDrafts("saveAsDraft")}
                        </DropdownMenuItem>
                      </>
                    }
                  >
                    {submitting && <Spinner />}
                    <span className="max-w-[14rem] truncate py-0.5 leading-normal">
                      {createLabel}
                    </span>
                  </SplitButton>
                </SendShortcutTooltip>
                {/* On phones the recorder sits beside the create button. */}
                {mobile && dictationControl}
              </div>
            </div>
          </form>

          {/* Numo takes over the dictation: the border highlights the edge of the modal
 while he works — same signal as the Numo “thinking”
 icon which replaces the microphone above. */}
          <AgentBeamOverlay active={numoBusy} />
        </DialogContent>
      </Dialog>
    </>
  );
}
