"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  SidePanel,
  SidePanelBody,
  SidePanelClose,
  SidePanelContent,
  SidePanelFooter,
  SidePanelTitle,
  cn,
  toast,
} from "mangue-ui";
import { Check, ListTodo, Trash2, X } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  AssigneeValue,
  DueDateValue,
  PropertyRow,
} from "@/components/issue-property-fields";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { ObjectiveAttachmentsSection } from "@/components/objective-attachments-section";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { useAuth } from "@/lib/auth-context";
import { useObjectiveTimeline } from "@/lib/use-objective-timeline";
import { useObjectiveDictation } from "@/lib/use-objective-dictation";
import { useAnalytics } from "@/lib/use-analytics";
import { objectiveProgress } from "@/lib/use-objectives-query";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import {
  OBJECTIVE_STATUSES,
  OBJECTIVE_STATUS_MAP,
  type ObjectiveStatus,
} from "@/lib/objective-constants";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import type {
  Issue,
  Member,
  Objective,
  ObjectiveDraftPatch,
  ObjectiveUpdateInput,
} from "@/lib/types";

// Bare (borderless) value-style trigger — matches the issue panel's property rows.
const TRIGGER =
  "-mr-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm whitespace-nowrap text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

/** Objective status picker rendered as a borderless property-row value. */
function ObjectiveStatusValue({
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
      align="end"
      tooltip={t("statusFieldLabel")}
      trigger={
        <button type="button" aria-label={t("statusFieldLabel")} className={TRIGGER}>
          <Icon className={cn("size-4 shrink-0", meta.color)} />
          <span className="truncate">{tStatus(meta.value)}</span>
        </button>
      }
    />
  );
}

/** Objective color swatch picker rendered as a borderless property-row value. */
function ObjectiveColorValue({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const pick = (c: string | null) => {
    onChange(c);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t("colorFieldLabel")} className={TRIGGER}>
          <span
            className={cn(
              "flex size-[18px] shrink-0 items-center justify-center rounded-full",
              value === null && "border border-dashed border-muted-foreground/60"
            )}
            style={value ? { backgroundColor: value } : undefined}
          />
          <span className="truncate text-muted-foreground">
            {value ? t("colorFieldLabel") : tCommon("none")}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
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

/**
 * Objective detail/edit surface — the objective twin of IssueSidePanel. Fields
 * edit inline; attachments + activity (events, comments, @Numo) live below. The
 * compact ObjectiveDialog is now create-only; all editing happens here.
 */
export function ObjectiveSidePanel({
  objective,
  open,
  onOpenChange,
  projectId,
  members,
  issues,
  onUpdate,
  onDelete,
}: {
  objective: Objective | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: Member[];
  /** All project issues — powers the done/total progress. */
  issues: Issue[];
  onUpdate: (id: string, updates: ObjectiveUpdateInput) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("Issue");
  const { track } = useAnalytics();
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Remount the markdown editor when the description is rewritten under it
  // (la dictée) — il ne lit `value` qu'au montage et ne commite qu'au blur.
  const [editorKey, setEditorKey] = useState(0);
  /** Conteneur de l'éditeur : sert de repère de focus (voir l'effet ci-dessous). */
  const descriptionRef = useRef<HTMLDivElement>(null);
  /** Dernière version de la description déjà reflétée à l'écran : distingue une
      réécriture par Numo (à adopter) de l'écho de notre propre commit. */
  const shownDescription = useRef("");
  /** Retouché à la main depuis la dernière synchro : sans ce drapeau, un simple
      aller-retour du focus recommiterait le reflet périmé du champ — autrement
      dit annulerait ce que la dictée vient d'écrire. */
  const descriptionEdited = useRef(false);

  const { items, addComment, updateComment, deleteComment, deleteAttachment } =
    useObjectiveTimeline(objective?.id ?? null);

  useEffect(() => {
    if (objective) setName(objective.name);
    shownDescription.current = objective?.description ?? "";
    descriptionEdited.current = false;
    setEditorKey((k) => k + 1);
  }, [objective?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // La dictée réécrit la description sous l'éditeur, qui ne relit pas `value` :
  // l'adopter, c'est le remonter. Jamais pendant qu'on y écrit — une version
  // refusée n'est PAS notée, elle reste « en attente » et le blur du conteneur
  // la prend.
  useEffect(() => {
    const next = objective?.description ?? "";
    if (
      next !== shownDescription.current &&
      !descriptionEdited.current &&
      !descriptionRef.current?.contains(document.activeElement)
    ) {
      shownDescription.current = next;
      setEditorKey((k) => k + 1);
    }
  }, [objective?.id, objective?.description]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply a dictated patch: one immediate objective update. The local name is
  // synced here; the description comes back through the prop, and the effect
  // above remounts the editor on it.
  const applyDictated = (patch: ObjectiveDraftPatch) => {
    if (!objective) return;
    const updates: ObjectiveUpdateInput = {
      ...patch,
      ...(patch.description !== undefined
        ? { description: patch.description.trim() || null }
        : {}),
    };
    if (Object.keys(updates).length === 0) return;
    void onUpdate(objective.id, updates).catch((err) =>
      toast.error((err as Error).message)
    );
    if (patch.name !== undefined) setName(patch.name);
  };

  // Voice editing (Numo): dictated commands become immediate field updates.
  // The draft fallbacks are for type-safety only — the mic lives inside the
  // panel, so dictation never runs without an open objective.
  const {
    busy: numoBusy,
    onTranscript,
    reset: resetDictation,
  } = useObjectiveDictation({
    projectId,
    mode: "edit",
    getDraft: () => ({
      name: objective?.name ?? "",
      description: objective?.description ?? "",
      status: objective?.status ?? "planned",
      lead_user_id: objective?.lead_user_id ?? null,
      target_date: objective?.target_date ?? null,
      color: objective?.color ?? null,
    }),
    applyPatch: applyDictated,
  });

  // A different objective (or a closed panel) = a fresh dictation session: drop
  // the history and abort any in-flight request.
  useEffect(() => {
    resetDictation();
  }, [objective?.id, resetDictation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une prise en cours de transcription (l'audio est parti, le texte n'est pas
  // revenu) : avec la suite Numo, c'est la fenêtre où fermer perd la dictée.
  const [transcribing, setTranscribing] = useState(false);
  const handleOpenChange = (next: boolean) => {
    // La dictée édite CET objectif : le transcript, puis le patch de Numo, vont
    // y atterrir. Fermer maintenant les jetterait — on refuse, en le disant (une
    // Échap sans effet passerait pour une panne).
    if (!next && (transcribing || numoBusy)) {
      toast.info(t("dictationInFlight"), { id: "dictation-in-flight" });
      return;
    }
    onOpenChange(next);
  };

  const progress = useMemo(
    () => (objective ? objectiveProgress(objective.id, issues) : null),
    [objective, issues]
  );

  // describeObjectiveEvent only reads members + due-date formatting; the other
  // context fields are unused for objectives.
  const eventCtx = useMemo(
    () => ({ members, objectives: [], categories: [], issues: [], projectKey: "" }),
    [members]
  );

  if (!objective) return null;

  const patch = async (updates: ObjectiveUpdateInput) => {
    try {
      await onUpdate(objective.id, updates);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== objective.name) void patch({ name: trimmed });
    else if (!trimmed) setName(objective.name);
  };

  const commitDescription = (markdown: string) => {
    const next = markdown.trim() || null;
    descriptionEdited.current = false;
    if (next === (objective.description ?? null)) return;
    // Ce qu'on vient d'écrire est déjà à l'écran : le noter évite que son écho
    // par la prop passe pour une réécriture distante et remonte l'éditeur.
    shownDescription.current = next ?? "";
    void patch({ description: next });
  };

  const handleDelete = async () => {
    await onDelete(objective.id);
    toast.success(t("deletedToast"));
    onOpenChange(false);
  };

  return (
    <>
      <SidePanel open={open} onOpenChange={handleOpenChange}>
        <SidePanelContent
          onInteractOutside={keepOverlayOpenForPopper}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header: color dot · dictate · delete · close */}
          <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-5 pb-3">
            <div className="flex min-w-0 items-center gap-1">
              <SidePanelTitle asChild>
                <span className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{
                      backgroundColor: objective.color ?? "var(--muted-foreground)",
                    }}
                    aria-hidden
                  />
                  <span className="truncate text-muted-foreground">{t("entity")}</span>
                </span>
              </SidePanelTitle>
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
                  onTranscription={(text) => {
                    track("objective_dictation_used", { surface: "side_panel" });
                    onTranscript(text);
                  }}
                  tooltipLabel={t("dictateEditTooltip")}
                  shortcutKey="mod+shift+d"
                  onProcessingChange={setTranscribing}
                />
              )}
            </div>
            <div className="-mr-1.5 flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={tCommon("moveToTrash")}
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

          <SidePanelBody className="flex flex-col gap-4 pt-0">
            <AutoTextarea
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="w-full shrink-0 overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
              placeholder={t("namePlaceholder")}
            />

            {/* Le conteneur sert de repère de focus : tant que le curseur est
              DANS l'éditeur, une réécriture par Numo ne le remonte pas — et au
              moment où il en sort, l'éditeur prend la version en attente (sans
              frappe, le blur ne commite rien, donc rien ne rejouerait l'effet). */}
            <div
              ref={descriptionRef}
              onBlur={() => {
                const description = objective.description ?? "";
                if (
                  descriptionEdited.current ||
                  description === shownDescription.current
                ) {
                  return;
                }
                shownDescription.current = description;
                setEditorKey((k) => k + 1);
              }}
            >
              <MarkdownEditor
                key={`${objective.id}:${editorKey}`}
                value={objective.description ?? ""}
                onCommit={commitDescription}
                onEdit={() => {
                  descriptionEdited.current = true;
                }}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>

            <ObjectiveAttachmentsSection
              objectiveId={objective.id}
              projectId={projectId}
            />

            {/* Key/value properties — borderless, like the issue panel */}
            <div className="flex flex-col">
              <PropertyRow label={t("statusFieldLabel")}>
                <ObjectiveStatusValue
                  value={objective.status}
                  onChange={(status) => void patch({ status })}
                />
              </PropertyRow>
              <PropertyRow label={t("leadFieldLabel")}>
                <AssigneeValue
                  value={objective.lead_user_id}
                  members={members}
                  onChange={(lead_user_id) => void patch({ lead_user_id })}
                />
              </PropertyRow>
              <PropertyRow label={t("targetDatePlaceholder")}>
                <DueDateValue
                  value={objective.target_date}
                  onChange={(target_date) => void patch({ target_date })}
                />
              </PropertyRow>
              <PropertyRow label={t("colorFieldLabel")}>
                <ObjectiveColorValue
                  value={objective.color}
                  onChange={(color) => void patch({ color })}
                />
              </PropertyRow>
            </div>

            {/* Progress + link to the filtered board */}
            {progress && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {t("completed", { done: progress.done, total: progress.total })}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${projectId}?objective=${objective.id}`}>
                      <ListTodo />
                      {t("viewLinkedIssues", {
                        issues: tIssue("entityPlural").toLowerCase(),
                      })}
                    </Link>
                  </Button>
                </div>
                <Progress value={progress.percent} />
              </div>
            )}

            <IssueActivity
              items={items}
              ctx={eventCtx}
              entity="objective"
              currentUserId={user?.id ?? null}
              projectId={projectId}
              onReply={(parentId, body, mentions, attachments) =>
                addComment(body, mentions, parentId, attachments)
              }
              onEditComment={updateComment}
              onDeleteComment={deleteComment}
              onDeleteAttachment={deleteAttachment}
            />
          </SidePanelBody>

          <SidePanelFooter className="border-t-0 pt-3 sm:flex-row">
            <CommentComposer
              members={members}
              projectId={projectId}
              onSubmit={(body, mentions, attachments) =>
                addComment(body, mentions, null, attachments)
              }
            />
          </SidePanelFooter>

          {/* Numo reprend la dictée : le liseré souligne le bord du panneau
            pendant qu'il travaille — même signal que l'icône Numo « thinking »
            qui remplace le micro dans l'en-tête. */}
          <AgentBeamOverlay active={numoBusy} />
        </SidePanelContent>
      </SidePanel>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteConfirmTitle", { name: objective.name })}
        description={t("deleteConfirmDescription", {
          issues: tIssue("entityPlural").toLowerCase(),
          days: TRASH_RETENTION_DAYS,
        })}
        confirmLabel={tCommon("moveToTrash")}
        cancelLabel={tCommon("cancel")}
        onConfirm={handleDelete}
      />
    </>
  );
}
