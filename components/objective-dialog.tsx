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
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { AssigneeCompact } from "@/components/issue-compact-fields";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { ProjectOrb } from "@/components/project-orb";
import { DraftRecoveryRow } from "@/components/draft-recovery-row";
import { CloseDraftDialog } from "@/components/close-draft-dialog";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import {
  AddResourceButton,
  ResourcePills,
  DropOverlay,
  pasteFileHandler,
  useFileDrop,
} from "@/components/resources";
import { NumoIcon } from "@/components/numo-icon";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useObjectiveDictation } from "@/lib/use-objective-dictation";
import { useAnalytics } from "@/lib/use-analytics";
import { useDrafts } from "@/lib/use-drafts";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { useSubmitShortcut } from "@/lib/keyboard/use-submit-shortcut";
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
  ObjectiveDraftPatch,
  ObjectiveUpdateInput,
  Project,
} from "@/lib/types";

// Bare (borderless) compact-field trigger — matches issue-compact-fields.tsx so
// the objective dialog's options row reads like the create-issue dialog's.
const BARE =
  "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted max-sm:p-2";

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
  initialName,
  onCreateInProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  /** When set, the dialog edits this objective; otherwise it creates one. */
  objective?: Objective | null;
  /** Nom prérempli à l'ouverture, en création : l'ajout rapide depuis un picker
   *  d'objectif y passe le texte déjà tapé dans la recherche. */
  initialName?: string;
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
  const { track } = useAnalytics();
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
  // Une prise en cours de transcription (l'audio est parti, le texte n'est pas
  // revenu) : avec la suite Numo, c'est la fenêtre où fermer perd la dictée.
  const [transcribing, setTranscribing] = useState(false);
  // ⌘/Ctrl + Entrée valide l'objectif, d'où qu'on soit dans le formulaire — y
  // compris depuis la description, que le champ de nom ne couvre pas.
  const submitShortcut = useSubmitShortcut();

  // Drafts, resources and voice dictation share the same two conditions: each
  // is project-scoped (the draft store, the storage prefix, the dictation route)
  // and each only makes sense while composing — editing an objective happens in
  // the side panel, whose own attach button and mic write straight to it.
  const composerEnabled = !objective && !!projectId;
  const drafts = useDrafts("objective", projectId ?? null, open && composerEnabled);
  const uploads = useAttachmentUploads(() => `projects/${projectId ?? ""}`);
  const drop = useFileDrop(uploads.addFiles);
  const mentions = useDescriptionMentions(projectId ?? null, members);

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
        : { ...EMPTY, name: initialName ?? "" }
    );
    editorNonEmptyRef.current = false;
    setActiveDraftId(null);
    setEditorKey((k) => k + 1);
  }, [open, objective, initialName]);

  const closeAndReset = () => {
    setForm(EMPTY);
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
    uploads.inputs.length > 0;

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
      resources: uploads.inputs,
    });
  };

  // Stash the draft and close (the confirmation's "Save" action).
  const saveDraftAndClose = () => {
    saveDraft();
    closeAndReset();
  };

  // « Abandonner » : on ferme SANS garder, et le brouillon d'origine s'en va
  // avec — sinon on retrouverait dans la rangée de reprise celui qu'on croyait
  // avoir abandonné. Même geste que la création réussie, qui consomme aussi le
  // brouillon dont elle vient.
  const discardDraftAndClose = () => {
    if (activeDraftId) drafts.remove(activeDraftId);
    closeAndReset();
  };

  const handleOpenChange = (next: boolean) => {
    // Une dictée en vol travaille SUR ce formulaire : le transcript, puis le
    // patch de Numo, vont y atterrir. Fermer maintenant les jetterait — on
    // refuse, en le disant (une Échap sans effet passerait pour une panne).
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
        // exist in the target — only the portable fields travel. Resources are
        // COPIED into the target project by the server (their storage paths
        // carry THIS project's prefix, so they can't be referenced as-is).
        await onCreateInProject(other.id, {
          name,
          description: form.description.trim() || null,
          status: form.status,
          target_date: form.target_date,
          color: form.color,
          copy_resources: uploads.inputs,
        });
        toast.success(t("createdInProjectToast", { project: other.name }));
      } else {
        await onCreate({ ...payload, resources: uploads.inputs });
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
      setEditorKey((k) => k + 1); // remount the editor with the new content
      editorNonEmptyRef.current = patch.description.trim() !== "";
    }
  };

  // Throwaway dictation session — history feeds Numo's follow-up commands and
  // dies with the dialog (nothing persisted).
  const { busy: numoBusy, onTranscript, reset: resetDictation } =
    useObjectiveDictation({
      projectId: projectId ?? "",
      mode: "create",
      getDraft: () => form,
      applyPatch,
    });

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/* Mêmes trois marges que le dialog de création de ticket : 32 px au
          large, 20 px sous `sm` (le modal ne fait plus que la fenêtre moins
          32 px), et rien sous 480 px — mangue-ui bascule alors en bottom sheet
          (vaul) qui pose déjà ses propres 16 px sur le contenu. */}
        <DialogContent
          className="p-8 max-sm:p-5 data-vaul-drawer:p-0 sm:max-w-2xl"
          onInteractOutside={keepOverlayOpenForPopper}
        >
          {/* Titre lecteur d'écran : à l'édition, le nom de l'objectif dit
              mieux de quoi il s'agit qu'un intitulé générique. */}
          <DialogTitle className="sr-only">
            {objective ? objective.name : t("newObjective")}
          </DialogTitle>

          <form
            {...submitShortcut}
            onSubmit={handleSubmit}
            className="relative flex flex-col rounded-lg"
            {...(composerEnabled
              ? { onPaste: pasteFileHandler(uploads.addFiles), ...drop.handlers }
              : {})}
          >
            {composerEnabled && <DropOverlay show={drop.dragging} />}
            {/* Recent drafts — a row above the name to restore or delete an
              abandoned draft (MIN-41). Hidden once the form has content. */}
            {composerEnabled &&
              form.name.trim() === "" &&
              form.description.trim() === "" && (
                <DraftRecoveryRow
                  drafts={drafts.drafts.map((d) => ({ id: d.id, title: d.name }))}
                  onRecover={recoverDraft}
                  onDelete={drafts.remove}
                  className="mb-3"
                />
              )}
            {/* Resources are context — they sit ABOVE the text being written. */}
            {composerEnabled && (
              <ResourcePills
                resources={uploads.pending.filter((p) => p.status === "done")}
                pending={uploads.pending}
                onRemove={(a) => {
                  // A link has no storage path — match on whichever identifies it.
                  const match = uploads.pending.find((p) =>
                    a.kind === "link"
                      ? p.url === a.url
                      : p.storage_path === a.storage_path
                  );
                  if (match) uploads.remove(match.localId);
                }}
                onRemovePending={uploads.remove}
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
              className="w-full overflow-hidden bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50 sm:text-2xl"
            />
            <MarkdownEditor
              key={editorKey}
              mentions={mentions}
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
                className="h-8 rounded-full max-sm:h-9"
              />
              <ColorCompact
                value={form.color}
                onChange={(color) => setForm((f) => ({ ...f, color }))}
              />
            </div>

            {/* Bottom bar — voice dictation at left, create controls at right,
              like the create-issue dialog : elle passe à la ligne sous `sm`,
              où le bouton prend une ligne à lui, pleine largeur. */}
            <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
              {composerEnabled &&
                (numoBusy ? (
                  <>
                    <span
                      className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center"
                      aria-hidden
                    >
                      <NumoIcon
                        state="thinking"
                        className="size-6 text-primary animate-in fade-in duration-300"
                      />
                    </span>
                    <span className="sr-only" role="status">
                      {t("numoWorking")}
                    </span>
                  </>
                ) : (
                  <DictateButton
                    onTranscription={(text) => {
                      track("objective_dictation_used", {
                        surface: "create_dialog",
                      });
                      onTranscript(text);
                    }}
                    disabled={submitting}
                    shortcutKey="mod+shift+d"
                    onProcessingChange={setTranscribing}
                    className="-ml-2"
                  />
                ))}
              {composerEnabled && (
                <AddResourceButton
                  onFiles={uploads.addFiles}
                  onLink={uploads.addLink}
                  onPage={uploads.addPage}
                  projectId={projectId}
                  disabled={submitting}
                />
              )}
              <div className="ml-auto flex items-center justify-end max-sm:w-full">
                {showSplit ? (
                  /* L'infobulle s'accroche à l'action, pas au chevron : ses
                     props traversent `SplitButton` jusqu'au bouton de gauche,
                     le seul que ⌘↵ actionne. */
                  <SendShortcutTooltip
                    label={t("createInProject", { project: currentProject!.name })}
                  >
                    <SplitButton
                      type="submit"
                      disabled={
                        submitting ||
                        numoBusy ||
                        !form.name.trim() ||
                        uploads.uploading
                      }
                      className="max-sm:w-full"
                      actionClassName="rounded-l-full pl-4 max-sm:flex-1"
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
                  </SendShortcutTooltip>
                ) : (
                  <SendShortcutTooltip
                    label={objective ? tCommon("save") : tCommon("create")}
                  >
                    <Button
                      type="submit"
                      className="rounded-full px-4 max-sm:w-full"
                      disabled={
                        submitting ||
                        numoBusy ||
                        !form.name.trim() ||
                        uploads.uploading
                      }
                    >
                      {submitting && <Spinner />}
                      {objective ? tCommon("save") : tCommon("create")}
                    </Button>
                  </SendShortcutTooltip>
                )}
              </div>
            </div>
          </form>

          {/* Numo reprend la dictée : le liseré souligne le bord du modal
            pendant qu'il travaille — même signal que l'icône Numo « thinking »
            qui remplace le micro plus haut. */}
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
