"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  cn,
  toast,
} from "mangue-ui";
import {
  Check,
  ChevronLeft,
  ListTodo,
  Mic,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import {
  AssigneeValue,
  DueDateValue,
  PropertyRow,
} from "@/components/issue-property-fields";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { ObjectiveResourcesSection } from "@/components/objective-resources-section";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import {
  DictateButton,
  type DictateButtonHandle,
} from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { useAuth } from "@/lib/auth-context";
import { useObjectiveTimeline } from "@/lib/use-objective-timeline";
import { useObjectiveDictation } from "@/lib/use-objective-dictation";
import { useAnalytics } from "@/lib/use-analytics";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { objectiveProgress } from "@/lib/use-objectives-query";
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
 * L'objectif ouvert, tel qu'il occupe la moitié droite de la page Objectifs
 * (MIN-226) — le pendant exact du détail du triage : un en-tête sans bordure
 * (le fondu du contenu dit qu'il continue au-dessus), puis un seul flux qui
 * défile, titre, description, pièces jointes, propriétés, avancement, activité.
 *
 * C'était un panneau latéral. Il ne l'est plus : un objectif est un objet qu'on
 * VIENT voir, pas un survol posé par-dessus autre chose. La colonne de gauche
 * dit lequel, cette surface dit tout le reste — et il n'y a donc plus rien à
 * fermer, ni de bouton pour le faire.
 */
export function ObjectiveDetail({
  objective,
  projectId,
  members,
  issues,
  onUpdate,
  onDelete,
  onBack,
  onBusyChange,
}: {
  objective: Objective;
  projectId: string;
  members: Member[];
  /** All project issues — powers the done/total progress. */
  issues: Issue[];
  onUpdate: (id: string, updates: ObjectiveUpdateInput) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  /** Sous `md`, la liste et le détail se relaient : rendre la main à la liste. */
  onBack: () => void;
  /**
   * La dictée est EN VOL (audio parti, patch pas revenu). La page s'en sert pour
   * refuser de changer d'objectif le temps que Numo réponde : le patch vise
   * l'objectif affiché, et en changer maintenant le jetterait — c'est le même
   * garde-fou que la fermeture refusée de l'ancien panneau, transposé au seul
   * geste qui, sur une page, emporte encore l'objectif sous la dictée.
   */
  onBusyChange: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("Issue");
  const { track } = useAnalytics();
  const [name, setName] = useState(objective.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Remount the markdown editor when the description is rewritten under it
  // (la dictée) — il ne lit `value` qu'au montage et ne commite qu'au blur.
  const [editorKey, setEditorKey] = useState(0);
  /** Conteneur de l'éditeur : sert de repère de focus (voir l'effet ci-dessous). */
  const descriptionRef = useRef<HTMLDivElement>(null);
  /** Dernière version de la description déjà reflétée à l'écran : distingue une
      réécriture par Numo (à adopter) de l'écho de notre propre commit. */
  const shownDescription = useRef(objective.description ?? "");
  /** Retouché à la main depuis la dernière synchro : sans ce drapeau, un simple
      aller-retour du focus recommiterait le reflet périmé du champ — autrement
      dit annulerait ce que la dictée vient d'écrire. */
  const descriptionEdited = useRef(false);
  const fade = useScrollFade<HTMLDivElement>();
  /** Le micro, rangé dans le menu : c'est par là qu'on l'allume. */
  const dictateRef = useRef<DictateButtonHandle>(null);

  const { items, addComment, updateComment, deleteComment, deleteAttachment } =
    useObjectiveTimeline(objective.id);

  useEffect(() => {
    setName(objective.name);
    shownDescription.current = objective.description ?? "";
    descriptionEdited.current = false;
    setEditorKey((k) => k + 1);
  }, [objective.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // La dictée réécrit la description sous l'éditeur, qui ne relit pas `value` :
  // l'adopter, c'est le remonter. Jamais pendant qu'on y écrit — une version
  // refusée n'est PAS notée, elle reste « en attente » et le blur du conteneur
  // la prend.
  useEffect(() => {
    const next = objective.description ?? "";
    if (
      next !== shownDescription.current &&
      !descriptionEdited.current &&
      !descriptionRef.current?.contains(document.activeElement)
    ) {
      shownDescription.current = next;
      setEditorKey((k) => k + 1);
    }
  }, [objective.id, objective.description]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (updates: ObjectiveUpdateInput) => {
    try {
      await onUpdate(objective.id, updates);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Apply a dictated patch: one immediate objective update. The local name is
  // synced here; the description comes back through the prop, and the effect
  // above remounts the editor on it.
  const applyDictated = (dictated: ObjectiveDraftPatch) => {
    const updates: ObjectiveUpdateInput = {
      ...dictated,
      ...(dictated.description !== undefined
        ? { description: dictated.description.trim() || null }
        : {}),
    };
    if (Object.keys(updates).length === 0) return;
    void onUpdate(objective.id, updates).catch((err) =>
      toast.error((err as Error).message)
    );
    if (dictated.name !== undefined) setName(dictated.name);
  };

  // Voice editing (Numo): dictated commands become immediate field updates.
  const {
    busy: numoBusy,
    onTranscript,
    reset: resetDictation,
  } = useObjectiveDictation({
    projectId,
    mode: "edit",
    getDraft: () => ({
      name: objective.name,
      description: objective.description ?? "",
      status: objective.status,
      lead_user_id: objective.lead_user_id,
      target_date: objective.target_date,
      color: objective.color,
    }),
    applyPatch: applyDictated,
  });

  // A different objective = a fresh dictation session: drop the history and
  // abort any in-flight request.
  useEffect(() => {
    resetDictation();
  }, [objective.id, resetDictation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Une prise en cours de transcription (l'audio est parti, le texte n'est pas
  // revenu) : avec la suite Numo, c'est la fenêtre où changer d'objectif perd la
  // dictée. La page en tient la garde ; ici on ne fait que la lui dire.
  const [transcribing, setTranscribing] = useState(false);
  const busy = transcribing || numoBusy;
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  const progress = useMemo(
    () => objectiveProgress(objective.id, issues),
    [objective.id, issues]
  );

  // describeObjectiveEvent only reads members + due-date formatting; the other
  // context fields are unused for objectives.
  const eventCtx = useMemo(
    () => ({ members, objectives: [], categories: [], issues: [], projectKey: "" }),
    [members]
  );

  const mentions = useDescriptionMentions(projectId, members);

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

  return (
    <>
      {/* En-tête SANS bordure : c'est le fondu du contenu qui dit qu'il continue
          au-dessus (même parti que le triage et la pull request). Il ne NOMME
          pas l'objectif — la colonne de gauche le désigne, le titre l'écrit en
          gros juste dessous — il ne porte que ce qu'on y FAIT. */}
      <div className="flex shrink-0 items-center gap-1.5 px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("backToList")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Numo reprend la dictée : le micro a disparu dans le menu, l'aveu du
              travail en cours reste ici, à la place qu'occupait la commande. */}
          {numoBusy && (
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
          )}

          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}?objective=${objective.id}`}>
              <ListTodo />
              {t("viewLinkedIssues", {
                issues: tIssue("entityPlural").toLowerCase(),
              })}
            </Link>
          </Button>

          {/* Monté en permanence, invisible au repos : c'est lui qui tient le
              magnétophone et l'ancre de l'onde. L'entrée de menu ci-dessous ne
              fait que le déclencher, et il reparaît alors en bouton d'arrêt. */}
          <DictateButton
            ref={dictateRef}
            hideWhenIdle
            onTranscription={(text) => {
              track("objective_dictation_used", { surface: "page" });
              onTranscript(text);
            }}
            tooltipLabel={t("dictateEditTooltip")}
            shortcutKey="mod+shift+d"
            onProcessingChange={setTranscribing}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={tCommon("manage")}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={numoBusy}
                onSelect={() => dictateRef.current?.toggle()}
              >
                <Mic />
                {t("dictateEditTooltip")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 />
                {tCommon("moveToTrash")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        ref={fade.ref}
        {...fade.scrollProps}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
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
              mentions={mentions}
              value={objective.description ?? ""}
              onCommit={commitDescription}
              onEdit={() => {
                descriptionEdited.current = true;
              }}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>

          {/* Key/value properties — borderless, like the issue panel. Les pièces
              jointes sont une ligne de cette table, la dernière : elles sont ce
              que l'objectif TRANSPORTE, après ce qu'il est. */}
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
            <ObjectiveResourcesSection
              objectiveId={objective.id}
              projectId={projectId}
            />
          </div>

          {/* Avancement. Le lien vers le board filtré est monté dans l'en-tête,
              avec les autres gestes : la carte ne porte plus que le chiffre. */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <span className="text-sm font-medium">
              {t("completed", { done: progress.done, total: progress.total })}
            </span>
            <Progress value={progress.percent} />
          </div>

          <IssueActivity
            items={items}
            ctx={eventCtx}
            entity="objective"
            currentUserId={user?.id ?? null}
            projectId={projectId}
            onReply={(parentId, body, mentionedUserIds, attachments) =>
              addComment(body, mentionedUserIds, parentId, attachments)
            }
            onEditComment={updateComment}
            onDeleteComment={deleteComment}
            onDeleteAttachment={deleteAttachment}
          />

          <CommentComposer
            members={members}
            projectId={projectId}
            onSubmit={(body, mentionedUserIds, attachments) =>
              addComment(body, mentionedUserIds, null, attachments)
            }
          />
        </div>
      </div>

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
        onConfirm={async () => {
          await onDelete(objective.id);
          toast.success(t("deletedToast"));
        }}
      />
    </>
  );
}
