"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
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
import { useDescriptionMentions } from "@/lib/use-mention-sources";
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
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { NumoIcon } from "@/components/numo-icon";
import { SendShortcutTooltip } from "@/components/send-shortcut";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { ProjectOrb } from "@/components/project-orb";
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
  SHORTCUT_KEYS,
  type ShortcutField,
} from "@/components/issue-field-shortcuts";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { useAuth } from "@/lib/auth-context";
import { useDrafts } from "@/lib/use-drafts";
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
import { resolveSmartFill } from "@/lib/smart-fill";
import type { RecurrenceCadence } from "@/lib/recurrence";
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
  initialTitle,
  initialDescription,
  initialCategoryIds,
  autoDictate = false,
  analyticsSource = "dialog",
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
  /** Preset the assignee (when creating from an assignee-filtered board, so
      the new issue doesn't instantly vanish from it). */
  initialAssigneeId?: string | null;
  /**
   * Contenu de départ — le formulaire s'ouvre déjà écrit. C'est la promotion
   * d'un retour en ticket : tout ce que le retour sait dire (son titre, son
   * texte, ses catégories) est posé, et l'humain complète le reste plutôt que
   * de recopier ce qu'il a sous les yeux.
   *
   * À la différence des trois presets ci-dessus, il n'est appliqué qu'UNE fois
   * par ouverture : réappliqué à chaque rendu, il écraserait la frappe en
   * cours.
   */
  initialTitle?: string;
  initialDescription?: string;
  initialCategoryIds?: string[];
  /**
   * Ouvre le formulaire micro déjà ouvert : le raccourci global ⌘⇧D n'ouvre
   * pas un dialog qu'il faudrait ensuite mettre en dictée, il ouvre une prise
   * de parole. Simplement transmis au bouton de dictée — c'est LUI qui
   * déclenche, à son montage (voir `autoStart`).
   */
  autoDictate?: boolean;
  /** Surface d'où vient la création — analytics uniquement (MIN-78). */
  analyticsSource?: AnalyticsPropsFor<"issue_created">["source"];
}) {
  const t = useTranslations("IssueUI");
  const { user } = useAuth();
  const { track } = useAnalytics();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState(DEFAULTS);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [createMore, setCreateMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Which field picker a keyboard shortcut (S/P/E/A/L/D/O) has opened, if any.
  const [openPicker, setOpenPicker] = useState<ShortcutField | null>(null);
  // Id of the draft currently loaded in the form (MIN-41): set when a draft is
  // recovered, so re-closing updates it in place rather than spawning a copy,
  // and a successful create removes exactly the draft it came from.
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  // Dismissing a form with content asks first (MIN-41) — confirming stashes it
  // as a local draft rather than losing it.
  const [confirmClose, setConfirmClose] = useState(false);
  // Closing the confirmation lets the dismissing pointer/click fall through to
  // this dialog below it and read as an outside click — which would immediately
  // re-open the confirmation just dismissed. This ref muffles the dialog's close
  // signal for the brief window right after the confirmation closes.
  const ignoreCloseAfterConfirmRef = useRef(false);
  // Une prise en cours de transcription (l'audio est parti, le texte n'est pas
  // revenu) : avec la suite Numo, c'est la fenêtre où fermer perd la dictée.
  const [transcribing, setTranscribing] = useState(false);
  // Remount the markdown editor to swap its content (it only commits on blur).
  const [editorKey, setEditorKey] = useState(0);
  // Live emptiness of the editor — `description` alone would miss text that was
  // typed but not yet committed (commit happens on blur) when the dialog closes.
  const editorNonEmptyRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Le contenu du dialog, pour savoir si le clavier lui appartient encore : un
  // second dialog par-dessus (confirmation de brouillon, création d'objectif
  // depuis le picker) doit garder ses touches pour lui.
  const contentRef = useRef<HTMLDivElement>(null);
  const createMoreId = useId();
  // ⌘/Ctrl + Entrée crée le ticket, d'où qu'on soit dans le formulaire — y
  // compris depuis la description, que le champ de titre ne couvre pas.
  const submitShortcut = useSubmitShortcut();
  const uploads = useAttachmentUploads(() => `projects/${projectId}`);
  const drop = useFileDrop(uploads.addFiles);
  const drafts = useDrafts("issue", projectId, open);
  const mentions = useDescriptionMentions(projectId, members);

  /**
   * SMART-FILL (MIN-260) — armé par le compte, coupable par ticket.
   *
   * `smartFillAvailable` décide si la bascule EXISTE : préférence coupée dans
   * les réglages, elle ne paraît nulle part et la rangée d'options reste
   * entière. `smartFill` est son état pour CE ticket, reposé à chaque ouverture
   * — couper Smart-fill sur un ticket ne le coupe pas pour le suivant, c'est un
   * geste ponctuel, pas un réglage déguisé.
   *
   * Quand il est actif, la rangée ne garde que les trois propriétés que
   * Smart-fill ne touche pas — statut, assigné, échéance. Les quatre autres ne
   * sont pas grisées mais RETIRÉES : un champ visible et vide, sur un formulaire
   * où quelque chose va le remplir, se lit comme un oubli.
   */
  const smartFillAvailable = resolveSmartFill(user?.user_metadata);
  const [smartFill, setSmartFill] = useState(smartFillAvailable);
  useEffect(() => {
    if (open) setSmartFill(smartFillAvailable);
  }, [open, smartFillAvailable]);

  // Account preference (Préférences → auto-attribution): pre-fill the assignee
  // with the creator. Guarded on membership — the assignee picker only lists
  // this project's members, so only seed when the user actually belongs here.
  const defaultAssigneeId =
    user?.user_metadata?.auto_assign_created === true &&
    members.some((m) => m.user_id === user.id)
      ? user.id
      : DEFAULTS.assignee_id;

  // The field values a freshly-opened dialog starts from: base defaults plus the
  // same presets the open effect applies (column status, objective, auto-assign).
  // Used both to seed on open and to reset after a "create more" submit.
  const freshFields = () => ({
    ...DEFAULTS,
    status: initialStatus ?? DEFAULTS.status,
    objective_id: initialObjectiveId ?? DEFAULTS.objective_id,
    assignee_id: initialAssigneeId ?? defaultAssigneeId,
  });

  // Apply the presets each time the dialog opens (a column's "+" reopens it with
  // that column's status; objective mode reopens it with the objective set;
  // the auto-assign preference seeds the assignee). Re-seeding on
  // defaultAssigneeId also covers members loading in after the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFields((f) => ({
      ...f,
      status: initialStatus ?? DEFAULTS.status,
      objective_id: initialObjectiveId ?? DEFAULTS.objective_id,
      assignee_id: initialAssigneeId ?? defaultAssigneeId,
    }));
  }, [open, initialStatus, initialObjectiveId, initialAssigneeId, defaultAssigneeId]);

  // Le contenu de départ, posé UNE fois par ouverture. Le drapeau est un ref et
  // non une dépendance d'effet : `initialCategoryIds` est un tableau, donc une
  // identité neuve à chaque rendu du parent, et sans ce garde-fou chaque rendu
  // réécrirait le titre par-dessus ce qu'on est en train de taper.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    if (initialTitle) setTitle(initialTitle);
    if (initialDescription) {
      setDescription(initialDescription);
      editorNonEmptyRef.current = true;
      setEditorKey((k) => k + 1); // remount the editor with the seeded content
    }
    if (initialCategoryIds?.length) setCategoryIds(initialCategoryIds);
  }, [open, initialTitle, initialDescription, initialCategoryIds]);

  // Ouverture à la voix : armé à l'ouverture, DÉSARMÉ dès que la prise part.
  // Le désarmement n'est pas une précaution en l'air — pendant que Numo reprend
  // la dictée, le bouton cède sa place à l'icône « thinking » et se démonte ;
  // il remonte quand Numo a fini, et un drapeau resté levé le ferait
  // réenregistrer dans la foulée du ticket qu'on vient de dicter.
  const [dictateArmed, setDictateArmed] = useState(false);
  useEffect(() => {
    setDictateArmed(open && autoDictate);
  }, [open, autoDictate]);

  // Ouverture du dialog (MIN-78) : le dénominateur du taux d'abandon — combien
  // de dialogs ouverts finissent en ticket réellement créé. `useTrackView`
  // garantit une seule émission par ouverture (StrictMode double les effets).
  useTrackView(open, "opened", () =>
    track("issue_create_dialog_opened", { source: analyticsSource })
  );

  // Field shortcuts: while the dialog is open, S/P/E/A/L/D/O open the matching
  // picker (anchored on its trigger in the options row), reusing the board-card
  // mapping. Guarded like the dictation shortcut — no modifiers, no key-repeat,
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
      // Un dialog empilé par-dessus (le picker d'objectif ouvre celui de
      // création d'objectif) piège le focus chez lui : sans ce garde-fou, une
      // touche pressée là-haut ouvrirait un picker DERRIÈRE lui. Les poppers
      // portalisés (les pickers eux-mêmes) sont hors du contenu du dialog, mais
      // leur champ de recherche est un INPUT — déjà écarté juste au-dessus.
      if (contentRef.current && el && !contentRef.current.contains(el)) return;
      const field = SHORTCUT_KEYS[eventKey(e)];
      if (!field) return;
      e.preventDefault();
      setOpenPicker(field);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  const clearContent = () => {
    setTitle("");
    setDescription("");
    setEditorKey((k) => k + 1);
    uploads.clear();
  };

  const reset = () => {
    clearContent();
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
    uploads.inputs.length > 0;

  // Snapshot the form as a draft (MIN-41) — reuses the active id so re-closing a
  // recovered draft updates it in place instead of piling up copies.
  const saveDraft = () => {
    drafts.save({
      id: activeDraftId ?? crypto.randomUUID(),
      projectId,
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
    // Swallow close signals while the confirmation owns the decision (it's up),
    // and for the brief window right after it closes — that window is the
    // fall-through click that would otherwise re-open the confirmation in a loop.
    if (!next && (confirmClose || ignoreCloseAfterConfirmRef.current)) return;
    // Dismissing a form with content asks first — confirming keeps it as a draft.
    if (!next && draftHasContent()) {
      setConfirmClose(true);
      return;
    }
    if (!next) reset();
    onOpenChange(next);
  };

  // Route the confirmation's own open/close through here so we can arm the
  // fall-through guard the instant it closes (keep-editing, Escape, or after
  // confirming). "Close draft" also closes the dialog via saveDraftAndClose,
  // which calls onOpenChange directly and bypasses handleOpenChange's guard.
  const handleConfirmOpenChange = (open: boolean) => {
    setConfirmClose(open);
    if (!open) {
      ignoreCloseAfterConfirmRef.current = true;
      window.setTimeout(() => {
        ignoreCloseAfterConfirmRef.current = false;
      }, 300);
    }
  };

  // Load a saved draft back into the form and remember its id so a create /
  // re-close targets the same entry.
  const recoverDraft = (id: string) => {
    const draft = drafts.find(id);
    if (!draft) return;
    track("issue_draft_recovered", {});
    setTitle(draft.title);
    setDescription(draft.description);
    setEditorKey((k) => k + 1); // remount the editor with the draft's content
    editorNonEmptyRef.current = draft.description.trim() !== "";
    setFields({
      status: draft.status,
      priority: draft.priority,
      effort: draft.effort,
      assignee_id: draft.assignee_id,
      objective_id: draft.objective_id,
      due_date: draft.due_date,
      recurrence: draft.recurrence ?? null,
    });
    setCategoryIds(draft.category_ids);
    uploads.restore(draft.resources);
    setActiveDraftId(draft.id);
  };

  // `target` is set only when creating in a different project (dropdown item).
  const submit = async (keepOpen: boolean, target?: Project) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const other = target && target.id !== projectId ? target : null;
    setSubmitting(true);
    try {
      if (other) {
        // Cross-project: statuses / priority / effort / due date are portable.
        // The assignee is a person (may belong to the target too) and categories
        // travel by NAME — the server keeps each only if the target project has
        // a matching member / category, and drops it otherwise. Attachments are
        // COPIED into the target project by the server (their storage paths carry
        // THIS project's prefix, so they can't be referenced as-is). Only the
        // objective can't travel (an objective is scoped to one project).
        const categoryNames = categories
          .filter((c) => categoryIds.includes(c.id))
          .map((c) => c.name);
        await onCreateInProject(other.id, {
          title: trimmed,
          description: description.trim() || null,
          status: fields.status,
          priority: fields.priority,
          effort: fields.effort,
          due_date: fields.due_date,
          recurrence: fields.recurrence,
          assignee_id: fields.assignee_id,
          category_names: categoryNames,
          copy_resources: uploads.inputs,
          smart_fill: smartFill,
        });
        toast.success(
          smartFill
            ? t("smartFillPendingToast")
            : t("issueCreatedInProjectToast", { project: other.name }),
        );
      } else {
        await onCreate({
          title: trimmed,
          description: description.trim() || null,
          ...fields,
          category_ids: categoryIds,
          resources: uploads.inputs,
          smart_fill: smartFill,
        });
        // Smart-fill : la carte n'est pas encore là (le serveur remplit avant
        // d'insérer), et le toast est la seule chose qui dit qu'elle arrive.
        // Sans lui, on referme un formulaire sur un board qui n'a pas bougé.
        toast.success(smartFill ? t("smartFillPendingToast") : t("issueCreatedToast"));
      }
      // Analytics (MIN-78) : métadonnées seulement — jamais le titre ni la
      // description, seulement leur présence et la tranche de longueur.
      track("issue_created", {
        source: analyticsSource,
        has_description: description.trim().length > 0,
        has_categories: categoryIds.length > 0,
        has_assignee: fields.assignee_id !== null,
        priority: fields.priority,
        status: fields.status,
        effort: fields.effort,
        cross_project: other !== null,
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
        // AND every property), exactly as if the dialog had just been reopened.
        clearContent();
        setFields(freshFields());
        setCategoryIds([]);
        setOpenPicker(null);
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
    // DICTER UNE DE CES QUATRE PROPRIÉTÉS COUPE SMART-FILL (MIN-260).
    //
    // « Bug urgent sur le login, petit » nomme une priorité et un effort : les
    // poser dans un formulaire dont les pickers sont masqués les rendrait
    // invisibles, et l'utilisateur n'aurait aucun moyen de voir que ce qu'il a
    // dit a bien été entendu. Le serveur les respecterait — il ne remplit que
    // les champs vides — mais « ça a marché » ne se déduit pas d'un écran muet.
    // Dire une propriété est une intention : elle reprend la main sur l'aide.
    if (
      patch.priority !== undefined ||
      patch.effort !== undefined ||
      patch.objective_id !== undefined ||
      Array.isArray(patch.category_ids)
    ) {
      setSmartFill(false);
    }
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
    projectId,
    mode: "create",
    getDraft: () => ({
      title,
      description,
      ...fields,
      category_ids: categoryIds,
    }),
    applyPatch,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/* Trois largeurs, trois marges. Au large, le modal garde ses 32 px.
          Sous `sm`, il ne fait plus que la fenêtre moins 32 px : 20 px suffisent
          à le faire respirer sans manger la ligne. Sous 480 px, mangue-ui le
          bascule en bottom sheet (vaul) et pose DÉJÀ ses propres 16 px sur le
          contenu — les nôtres s'y ajouteraient, soit près d'un tiers de la
          largeur d'un téléphone perdu en marges, d'où le `p-0` de ce cas-là
          (l'attribut de vaul, seul repère fiable du basculement). */}
        <DialogContent
          ref={contentRef}
          className="p-8 max-sm:p-5 data-vaul-drawer:p-0 sm:max-w-2xl"
          onInteractOutside={keepOverlayOpenForPopper}
        >
          <DialogTitle className="sr-only">{t("newIssueTitle")}</DialogTitle>

          <form
            {...submitShortcut}
            onSubmit={(e) => {
              e.preventDefault();
              void submit(createMore);
            }}
            className="relative flex flex-col rounded-lg"
            onPaste={pasteFileHandler(uploads.addFiles)}
            {...drop.handlers}
          >
            <DropOverlay show={drop.dragging} />
            {/* Recent drafts — a row above the title to restore or delete an
              abandoned draft (MIN-41). Hidden once the form has content. */}
            {title.trim() === "" && description.trim() === "" && (
              <DraftRecoveryRow
                drafts={drafts.drafts.map((d) => ({ id: d.id, title: d.title }))}
                onRecover={recoverDraft}
                onDelete={drafts.remove}
                className="mb-3"
              />
            )}
            {/* Resources are context — they sit ABOVE the text being written. */}
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
              className="w-full overflow-hidden bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50 sm:text-2xl"
            />
            <MarkdownEditor
              mentions={mentions}
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
                open={openPicker === "status"}
                onOpenChange={(o) => setOpenPicker(o ? "status" : null)}
                shortcutHint={KEY_FOR_FIELD.status}
              />
              {/* Priorité, effort et catégories : ce que Smart-fill pose
                  lui-même. Retirés — pas grisés — quand il est armé. */}
              {!smartFill && (
                <>
                <PriorityCompact
                  value={fields.priority}
                  onChange={(priority) => setFields((f) => ({ ...f, priority }))}
                  open={openPicker === "priority"}
                  onOpenChange={(o) => setOpenPicker(o ? "priority" : null)}
                  shortcutHint={KEY_FOR_FIELD.priority}
                />
                <EffortCompact
                  value={fields.effort}
                  onChange={(effort) => setFields((f) => ({ ...f, effort }))}
                  open={openPicker === "effort"}
                  onOpenChange={(o) => setOpenPicker(o ? "effort" : null)}
                  shortcutHint={KEY_FOR_FIELD.effort}
                />
                <CategoriesCompact
                  categories={categories}
                  projectId={projectId}
                  value={categoryIds}
                  onChange={setCategoryIds}
                  open={openPicker === "category"}
                  onOpenChange={(o) => setOpenPicker(o ? "category" : null)}
                  shortcutHint={KEY_FOR_FIELD.category}
                />
                </>
              )}
              <AssigneeCompact
                value={fields.assignee_id}
                onChange={(assignee_id) =>
                  setFields((f) => ({ ...f, assignee_id }))
                }
                members={members}
                open={openPicker === "assignee"}
                onOpenChange={(o) => setOpenPicker(o ? "assignee" : null)}
                shortcutHint={KEY_FOR_FIELD.assignee}
              />
              <DueDateCompact
                value={fields.due_date}
                onChange={(due_date) => setFields((f) => ({ ...f, due_date }))}
                recurrence={fields.recurrence}
                onRecurrenceChange={(next) => setFields((f) => ({ ...f, ...next }))}
                open={openPicker === "dueDate"}
                onOpenChange={(o) => setOpenPicker(o ? "dueDate" : null)}
                shortcutHint={KEY_FOR_FIELD.dueDate}
              />
              {/* L'objectif aussi vient de Smart-fill — il ferme la liste des
                  quatre, et la bascule prend leur place au bout de la rangée. */}
              {!smartFill && (
                <ObjectiveCompact
                  value={fields.objective_id}
                  onChange={(objective_id) =>
                    setFields((f) => ({ ...f, objective_id }))
                  }
                  objectives={objectives}
                  projectId={projectId}
                  open={openPicker === "objective"}
                  onOpenChange={(o) => setOpenPicker(o ? "objective" : null)}
                  shortcutHint={KEY_FOR_FIELD.objective}
                />
              )}
              {smartFillAvailable && (
                <SmartFillCompact value={smartFill} onChange={setSmartFill} />
              )}
            </div>

            {/* Bottom bar — voice dictation at left, create controls at right.
              Elle passe à la ligne sous `sm` : micro, trombone et « créer
              plus » tiennent sur la première, le bouton — qui porte le nom du
              projet — prend la seconde, pleine largeur. */}
            <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
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
                  onTranscription={(text) => {
                    track("issue_dictation_used", { surface: "create_dialog" });
                    onTranscript(text);
                  }}
                  disabled={submitting}
                  autoStart={dictateArmed}
                  onAutoStart={() => setDictateArmed(false)}
                  shortcutKey="mod+shift+d"
                  onProcessingChange={setTranscribing}
                  className="-ml-2"
                />
              )}
              {numoBusy && (
                <span className="sr-only" role="status">
                  {t("numoWorking")}
                </span>
              )}
              <AddResourceButton
                onFiles={uploads.addFiles}
                onLink={uploads.addLink}
                disabled={submitting}
              />
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
              </div>
              {/* Le bouton dans son propre bloc : c'est lui qui bascule sur une
                ligne à lui, pleine largeur, quand la barre passe à la ligne. */}
              <div className="flex items-center justify-end max-sm:w-full sm:ml-1">
                {otherProjects.length > 0 && currentProject ? (
                  /* L'infobulle s'accroche à l'action, pas au chevron : ses
                     props traversent `SplitButton` jusqu'au bouton de gauche,
                     le seul que ⌘↵ actionne. */
                  <SendShortcutTooltip
                    label={t("createInProject", { project: currentProject.name })}
                  >
                    <SplitButton
                      type="submit"
                      disabled={submitting || numoBusy || !title.trim() || uploads.uploading}
                      className="max-sm:w-full"
                      actionClassName="rounded-l-full pl-4 max-sm:flex-1"
                      triggerClassName="rounded-r-full"
                      menuLabel={t("createInOtherProject")}
                      menu={otherProjects.map((p) => (
                        <DropdownMenuItem
                          key={p.id}
                          onSelect={() => void submit(createMore, p)}
                        >
                          <ProjectOrb seed={p.id} iconUrl={p.icon_url} className="size-4" />
                          <span className="truncate">{p.name}</span>
                        </DropdownMenuItem>
                      ))}
                    >
                      {submitting && <Spinner />}
                      <span className="max-w-[14rem] truncate">
                        {t("createInProject", { project: currentProject.name })}
                      </span>
                    </SplitButton>
                  </SendShortcutTooltip>
                ) : (
                  <SendShortcutTooltip label={t("createTicket")}>
                    <Button
                      type="submit"
                      className="rounded-full px-4 max-sm:w-full"
                      disabled={submitting || numoBusy || !title.trim() || uploads.uploading}
                    >
                      {submitting && <Spinner />}
                      {t("createTicket")}
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

      {/* Dismissing a non-empty draft asks first — Escape / outside click / any
        close path funnels through handleOpenChange above. */}
      <CloseDraftDialog
        open={confirmClose}
        onOpenChange={handleConfirmOpenChange}
        onConfirm={saveDraftAndClose}
        onDiscard={discardDraftAndClose}
      />
    </>
  );
}
