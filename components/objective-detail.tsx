"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { AppContentHeader } from "@/components/app-content-header";
// Deferred editor: keeps tiptap (~1.5 MB) out of the objectives route —
// see markdown-editor-lazy.tsx. Warmed from idle time in ObjectiveDetail.
import {
  MarkdownEditor,
  useIdleMarkdownEditorPreload,
} from "@/components/markdown-editor-lazy";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import {
  AssigneeValue,
  DueDateValue,
  PropertyRow,
} from "@/components/issue-property-fields";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { ObjectiveProgressStat } from "@/components/objective-progress";
import { ObjectiveResourcesSection } from "@/components/objective-resources-section";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import {
  DictateButton,
  type DictateButtonHandle,
} from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { ObjectiveStatusIndicator } from "@/components/issue-indicators";
import { Kbd } from "@/components/ui/kbd";
import { matchesModCombo } from "@/lib/keyboard/mod-combo";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
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
      align="end"
      tooltip={t("statusFieldLabel")}
      trigger={
        <button type="button" aria-label={t("statusFieldLabel")} className={TRIGGER}>
          <ObjectiveStatusIndicator status={meta.value} className="size-4" />
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
 * The open objective, as it occupies the right half of the Objectives page
 * (MIN-226) — the exact counterpart of the triage detail: a borderless header
 * (the content fade says it continues above), then a single stream that scrolls, title, description, attachments, properties, progress, activity.
 *
 * This was a side panel. It is no longer: an objective is an object that we
 * COME to see, not a hover placed on top of something else. The left column
 * says which one, this surface says everything else — and so there's nothing left to close, nor a button to do it.
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
  /** Under `md`, the list and the detail take turns: return control to the list. */
  onBack: () => void;
  /**
 * The dictation is IN FLIGHT (audio gone, patch not returned). The page uses it to
 * refuse to change the objective until Numo responds: the patch targets
 * the displayed objective, and changing it now would throw it away — it's the same
 * safeguard as the refused closure of the old panel, transposed to the single
 * gesture which, on a page, still carries the objective under dictation.
 */
  onBusyChange: (busy: boolean) => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("Issue");
  const { track } = useAnalytics();
  // Mounts with the objectives page: warm the editor chunk once painted.
  useIdleMarkdownEditorPreload();
  const [name, setName] = useState(objective.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Remount the markdown editor when the description is rewritten under it
  // (dictation) — it only reads `value` when editing and only commits when blurring.
  const [editorKey, setEditorKey] = useState(0);
  /** Editor container: serves as a focus marker (see effect below). */
  const descriptionRef = useRef<HTMLDivElement>(null);
  /** Latest version of the description already reflected on the screen: distinguishes a
 rewrite by Numo (to be adopted) from the echo of our own commit. */
  const shownDescription = useRef(objective.description ?? "");
  /** Retouched by hand since the last sync: without this flag, a simple
 round trip of the focus would recommit the outdated reflection of the field - otherwise
 said would cancel what the dictation has just written. */
  const descriptionEdited = useRef(false);
  const fade = useScrollFade<HTMLDivElement>();
  /** The microphone, stored in the menu: this is how you turn it on. */
  const dictateRef = useRef<DictateButtonHandle>(null);
  const mod = useModKey();
  /** The project board, filtered on this objective — the button and ⌘O lead there. */
  const issuesHref = `/projects/${projectId}?objective=${objective.id}`;

  const { items, addComment, updateComment, deleteComment, deleteAttachment } =
    useObjectiveTimeline(objective.id);

  useEffect(() => {
    setName(objective.name);
    shownDescription.current = objective.description ?? "";
    descriptionEdited.current = false;
    setEditorKey((k) => k + 1);
  }, [objective.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⌘O / Ctrl+O: the “view tickets” button without the mouse. He wears a
  // modify because the page is FULL of fields — name, description,
  // comment: a bare "O" would be written in one of these instead of navigating.
  // So it also starts from a field, like dictation, and `preventDefault`
  // swallows the browser's “open a file” in passing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matchesModCombo(e, "o")) return;
      // An open dialog (deletion confirmation) holds the screen: we cannot
      // does not take it elsewhere under the user's fingers.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      e.preventDefault();
      router.push(issuesHref);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [router, issuesHref]);

  // The dictation rewrites the description under the editor, which does not reread `value`:
  // to adopt it is to reassemble it. Never while writing — a version
  // refused is NOT noted, it remains “pending” and the container blurs
  // takes it.
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

  // A take being transcribed (the audio is gone, the text is not
  // income): with the Numo suite, this is the window where changing lenses loses the
  // dictation. The page holds custody of it; here we just tell him.
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
    // What we have just written is already on the screen: writing it down prevents its echo
    // through the prop goes for a remote rewrite and returns the editor.
    shownDescription.current = next ?? "";
    void patch({ description: next });
  };

  return (
    <>
      {/* Borderless header: this is the fade of content that says it continues
 above (same part as triage and pull request). It does not NAME
 the objective - the left column designates it, the title writes it in big
 just below - it only describes what we DO there. */}
      <AppContentHeader contentClassName="gap-1.5 px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("backToList")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Numo resumes dictation: the microphone has disappeared in the menu, the acknowledgment of
 work in progress remains here, in the place occupied by the command. */}
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

          {/* The progress, mounted here from the map it occupied in the middle of the
 flow. It was never a SECTION of the goal — it's a header number, and its place is against the link to the tickets it counts: "3/12" and "see all 12 tickets" are read with a single eye gesture. */}
          <ObjectiveProgressStat progress={progress} tooltip className="mr-1" />

          <Button asChild variant="outline" size="sm">
            <Link href={issuesHref}>
              <ListTodo />
              {t("viewLinkedIssues", {
                issues: tIssue("entityPlural").toLowerCase(),
              })}
              {/* Two pads, like everywhere else: “⌘O” in a single
 would read as a single key. */}
              <span className="ml-0.5 inline-flex items-center gap-0.5 opacity-60">
                <Kbd size="sm">{mod}</Kbd>
                <Kbd size="sm">O</Kbd>
              </span>
            </Link>
          </Button>

          {/* Permanently mounted, invisible when at rest: it is he who holds the
 tape recorder and the anchor of the wave. The menu entry below does
 only triggers it, and it then reappears as a stop button. */}
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
              {/* Which MODIFIES the objective on one side of the line, which REMOVES it from
 the other: without it, the trash is one step away from dictation,
 in a menu that you open without looking. */}
              <DropdownMenuSeparator />
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
      </AppContentHeader>

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

          {/* The container serves as a focus mark: as long as the cursor is
 IN the editor, a rewrite by Numo does not bring it up — and at the moment it exits, the editor takes the pending version (without
 hitting, the blur commits nothing, so nothing would replay the effect). */}
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

          {/* Key/value properties — borderless, like the issue panel. The attached
 are a row of this table, the last: they are what
 that the objective TRANSPORTS, after what it is. */}
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
        </div>
      </div>

      <div className="dock-above-nav shrink-0 bg-background px-4 py-3 md:px-6">
        <div className="mx-auto max-w-3xl">
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
