"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations, useFormatter } from "next-intl";
import {
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import { AgentBeam } from "@/components/agent-beam";
import {
  Calendar,
  ChevronRight,
  ClipboardCopy,
  GitPullRequest,
  IterationCw,
  Link2,
  ListChecks,
  Plus,
  Triangle,
  User,
} from "lucide-react";
import { NumoIcon } from "@/components/numo-icon";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  isClosedStatus,
  issueIdentifier,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import { IntegrationIndicator } from "@/components/integration-indicator";
import {
  StatusIndicator,
  PriorityIndicator,
  EffortIndicator,
  RelationIcon,
} from "@/components/issue-indicators";
import { RelationChips, type ChipRelation } from "@/components/relation-chips";
import { RelationTargetPicker } from "@/components/relation-target-picker";
import {
  useAgentActive,
  useAgentHasSession,
  useAgentPr,
  type IssuePr,
} from "@/components/agent/agent-activity-context";
import { setAgentComposeDraft } from "@/lib/agent-compose-draft";
import { usePlanGates } from "@/lib/use-billing-query";
import { agentLaunchPromptVariant } from "@/lib/agent-launch-prompt";
import { RELATION_TYPES } from "@/lib/relation-constants";
import type {
  Category,
  Issue,
  IssueRelationType,
  IssueUpdateInput,
  Member,
  Objective,
  Project,
} from "@/lib/types";
import { ProjectOrb } from "@/components/project-orb";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  SearchSelect,
  SearchMultiSelect,
  type PickerOption,
} from "@/components/search-select";
import {
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import {
  IssueShortcutMenu,
  KEY_FOR_FIELD,
  useIssueFieldShortcuts,
} from "@/components/issue-field-shortcuts";
import { buildIssuePrompt } from "@/lib/issue-prompt";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { DropOverlay, useFileDrop } from "@/components/attachments";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { addIssueAttachmentsApi } from "@/lib/use-issue-attachments";
import {
  resolvePromptCopyAutoStart,
  shouldAutoStartOnPromptCopy,
} from "@/lib/prompt-copy-auto-start";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import { planProgress, type PlanProgress } from "@/lib/plan";

/** Strip common markdown so the description preview reads as plain text. */
function plainPreview(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ── Inline indicator pickers ────────────────────────────────────────────
   Each indicator on the card is a dropdown trigger: clicking it edits the
   field in place. `stop` keeps the click/drag from bubbling to the card (which
   would open the side panel or start a drag). Without an `onChange` the picker
   renders the plain indicator (e.g. inside the drag overlay). */

const TRIGGER_CLASS =
  "-m-0.5 flex items-center rounded-md p-0.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

// Roomier hit area for the smaller indicators (priority / effort / category).
const TRIGGER_CLASS_LG =
  "-m-1.5 flex min-w-0 items-center rounded-md p-1.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function StatusPick({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange?: (v: IssueStatus) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tStatus = useTranslations("Status");
  if (!onChange) return <StatusIndicator status={value} />;
  const options: PickerOption[] = ALL_STATUSES.map((s) => ({
    value: s.value,
    label: tStatus(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueStatus)}
      options={options}
      align="start"
      tooltip={tField("status")}
      shortcutHint={KEY_FOR_FIELD.status}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changeStatusAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS}
        >
          <StatusIndicator status={value} />
        </button>
      }
    />
  );
}

function PriorityPick({
  value,
  onChange,
}: {
  value: IssuePriority;
  onChange?: (v: IssuePriority) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  if (!onChange) return <PriorityIndicator priority={value} />;
  const options: PickerOption[] = PRIORITIES.map((p) => ({
    value: p.value,
    label: tPriority(p.value),
    icon: <PriorityIndicator priority={p.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssuePriority)}
      options={options}
      align="start"
      tooltip={tField("priority")}
      shortcutHint={KEY_FOR_FIELD.priority}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changePriorityAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS_LG}
        >
          <PriorityIndicator priority={value} />
        </button>
      }
    />
  );
}

function EffortPick({
  value,
  onChange,
}: {
  value: IssueEffort | null;
  onChange?: (v: IssueEffort | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const display = value ? (
    <EffortIndicator effort={value} />
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground/60">
      <Triangle className="size-[18px] shrink-0" />
      <span className="text-sm font-medium leading-none">–</span>
    </span>
  );
  if (!onChange) return display;
  const options: PickerOption[] = EFFORTS.map((e) => ({
    value: e.value,
    label: e.label,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueEffort | null)}
      options={options}
      noneOption={{ label: tCommon("none") }}
      align="start"
      tooltip={tField("effort")}
      shortcutHint={KEY_FOR_FIELD.effort}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changeEffortAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS_LG}
        >
          {display}
        </button>
      }
    />
  );
}

function CategoryPick({
  categories,
  selectedIds,
  onChange,
}: {
  categories: Category[];
  selectedIds: string[];
  onChange?: (ids: string[]) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const selected = categories.filter((c) => selectedIds.includes(c.id));
  const first = selected[0];
  const extra = Math.max(0, selected.length - 1);
  const display = first ? (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: first.color }}
        aria-hidden
      />
      <span className="truncate">{first.name}</span>
      {extra > 0 && <span className="shrink-0 text-muted-foreground">+{extra}</span>}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground/60">{t("noneFem")}</span>
  );
  if (!onChange) return display;
  const options: PickerOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: (
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: c.color }}
        aria-hidden
      />
    ),
  }));
  return (
    <SearchMultiSelect
      values={selectedIds}
      onChange={onChange}
      options={options}
      align="end"
      tooltip={tField("categories")}
      shortcutHint={KEY_FOR_FIELD.category}
      stopPropagation
      emptyText={categories.length === 0 ? t("noCategoriesHint") : undefined}
      trigger={
        <button
          type="button"
          aria-label={t("editCategoriesAria")}
          onClick={stop}
          onPointerDown={stop}
          className={TRIGGER_CLASS_LG}
        >
          {display}
        </button>
      }
    />
  );
}

function AssigneePick({
  assignee,
  members,
  onChange,
}: {
  assignee: Member | null;
  members: Member[];
  onChange?: (id: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const avatar = assignee ? (
    <UserAvatar
      url={assignee.avatar_url}
      name={displayName(assignee)}
      seed={assignee.user_id}
      title={displayName(assignee)}
      className="size-6 text-[10px]"
    />
  ) : (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground/60"
      title={tField("unassigned")}
    >
      <User className="size-3.5" />
    </span>
  );
  if (!onChange) return avatar;
  const options: PickerOption[] = members.map((m) => ({
    value: m.user_id,
    label: displayName(m),
    keywords: m.email ? [m.email] : undefined,
    icon: (
      <UserAvatar
        url={m.avatar_url}
        name={displayName(m)}
        seed={m.user_id}
        className="size-5 text-[9px]"
      />
    ),
  }));
  return (
    <SearchSelect
      value={assignee?.user_id ?? null}
      onChange={onChange}
      options={options}
      noneOption={{ label: tField("unassigned") }}
      align="end"
      tooltip={tField("assignee")}
      shortcutHint={KEY_FOR_FIELD.assignee}
      stopPropagation
      trigger={
        <button
          type="button"
          aria-label={t("changeAssigneeAria")}
          onClick={stop}
          onPointerDown={stop}
          className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
        >
          {avatar}
        </button>
      }
    />
  );
}

function DueDatePick({
  value,
  onChange,
}: {
  value: string;
  onChange?: (v: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const format = useFormatter();
  const parsed = parseDueDate(value);
  if (!parsed) return null;

  // Read-only (e.g. inside the drag overlay): plain label, no picker.
  if (!onChange) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Calendar className="size-3 shrink-0" />
        {format.dateTime(parsed, dueDateFormat(parsed, { compact: true }))}
      </span>
    );
  }

  return (
    <DateTimePicker
      variant="chip"
      value={value}
      onChange={onChange}
      ariaLabel={t("changeDueDateAria")}
      tooltip={tField("dueDate")}
      shortcutHint={KEY_FOR_FIELD.dueDate}
      stopPropagation
    />
  );
}

/** Read-only objective indicator on the card — colored dot + name, shown on the
    bottom line (mirrors how the category is displayed). */
function ObjectiveIndicator({ objective }: { objective: Objective }) {
  const tField = useTranslations("Field");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
            aria-hidden
          />
          <span className="truncate">{objective.name}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tField("objectiveLinked")}</TooltipContent>
    </Tooltip>
  );
}

/** Compact plan progress on the card header: checklist icon + "done/total".
    Clicking it opens the side panel straight on the plan tab. Read-only (plain
    span, no handler) inside the drag overlay. Shown only when the plan has tasks. */
function PlanPick({
  progress,
  onOpen,
}: {
  progress: PlanProgress;
  onOpen?: () => void;
}) {
  const t = useTranslations("IssueUI");
  const content = (
    <>
      <ListChecks className="size-3.5 shrink-0" />
      <span className="tabular-nums">
        {progress.done}/{progress.total}
      </span>
    </>
  );
  if (!onOpen) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {content}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("viewPlanAria")}
          onClick={(e) => {
            stop(e);
            onOpen();
          }}
          onPointerDown={stop}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted"
        >
          {content}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("viewPlanAria")}</TooltipContent>
    </Tooltip>
  );
}

/** « PR disponible » sur l'en-tête de la carte, à la place du plan quand une pull
    request existe pour ce ticket. Cliquer ouvre la review de la PR. Read-only (span
    sans handler) dans le drag overlay / board public. */
function PrPick({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations("Agent");
  const content = (
    <>
      <GitPullRequest className="size-3.5 shrink-0" />
      <span className="truncate">{t("prBadge")}</span>
    </>
  );
  if (!onOpen) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-500">
        {content}
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("viewPullRequest")}
          onClick={(e) => {
            stop(e);
            onOpen();
          }}
          onPointerDown={stop}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-medium text-emerald-600 outline-none transition-colors hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10 dark:text-emerald-500"
        >
          {content}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("viewPullRequest")}</TooltipContent>
    </Tooltip>
  );
}

/** Presentational card body — shared by the sortable card and the drag overlay. */
export function IssueCardBody({
  issue,
  projectKey,
  project,
  memberMap,
  categoryMap,
  objectiveMap,
  parentNumber,
  relations,
  onOpenParent,
  onOpenRelated,
  onOpenPlan,
  onUpdate,
  onSetCategories,
  inCurrentCycle,
  dragging,
  selected,
  pr,
  onOpenPr,
}: {
  issue: Issue;
  projectKey: string;
  /** On the cross-project (global) boards, the issue's project — renders an
      origin-project chip at the top of the card. Omitted on project boards. */
  project?: Project;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  /** Objectives by id — the linked one shows as a bottom-line indicator. */
  objectiveMap?: Map<string, Objective>;
  /** Parent issue's number — when set, the card is a sub-issue and shows the
      parent identifier + chevron before its own identifier. */
  parentNumber?: number;
  /** This issue's relations (blocks/blocked-by/related), pre-sorted by priority —
      the highest-signal one shows as a chip after the identifier. */
  relations?: ChipRelation[];
  /** Opens the parent's side panel (clicking the parent identifier). */
  onOpenParent?: () => void;
  /** Opens a related issue's side panel (clicking a relation chip). */
  onOpenRelated?: (issueId: string) => void;
  /** Opens this issue's side panel on the plan tab (clicking the plan indicator). */
  onOpenPlan?: () => void;
  /** PR disponible pour ce ticket → chip « PR disponible » À LA PLACE du plan. */
  pr?: IssuePr | null;
  /** Ouvre la review de la pull request (clic sur le chip « PR disponible »). */
  onOpenPr?: () => void;
  /** When set, the status/priority/effort/assignee/due indicators become pickers. */
  onUpdate?: (patch: IssueUpdateInput) => void;
  /** When set, the category indicator becomes an inline multi-select picker. */
  onSetCategories?: (ids: string[]) => void;
  /** The issue belongs to MY current cycle (MIN-32) — shows the blue cycle
      icon before the identifier. Boards leave it unset in cycle view (where
      every card is in the cycle, the icon would be noise). */
  inCurrentCycle?: boolean;
  selected?: boolean;
  dragging?: boolean;
}) {
  const t = useTranslations("IssueUI");
  const tCycles = useTranslations("Cycles");
  const plan = planProgress(issue.plan);
  const assignee = issue.assignee_id
    ? memberMap.get(issue.assignee_id) ?? null
    : null;
  const objective =
    issue.objective_id && objectiveMap
      ? objectiveMap.get(issue.objective_id) ?? null
      : null;
  const description = issue.description ? plainPreview(issue.description) : "";

  const setStatus = onUpdate
    ? (status: IssueStatus) => onUpdate({ status })
    : undefined;
  const setPriority = onUpdate
    ? (priority: IssuePriority) => onUpdate({ priority })
    : undefined;
  const setEffort = onUpdate
    ? (effort: IssueEffort | null) => onUpdate({ effort })
    : undefined;
  const setAssignee = onUpdate
    ? (id: string | null) => onUpdate({ assignee_id: id })
    : undefined;
  const setDueDate = onUpdate
    ? (date: string | null) => onUpdate({ due_date: date })
    : undefined;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border p-3 text-left shadow-sm",
        // Sélection groupée (MIN-75) : fond bleuté plutôt qu'un liseré.
        selected ? "bg-primary/10" : "bg-card",
        dragging && "cursor-grabbing shadow-lg"
      )}
    >
      {/* Cross-project boards only: the issue's origin project (orb + name). */}
      {project && (
        <div className="-mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ProjectOrb seed={project.id} iconUrl={project.icon_url} className="size-3.5" />
          <span className="truncate">{project.name}</span>
        </div>
      )}

      {/* Identifier (préfixé des icônes cycle / intégration le cas échéant) + assignee */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
          {inCurrentCycle && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex shrink-0 items-center text-blue-500 dark:text-blue-400">
                  <IterationCw className="size-3" aria-label={tCycles("inCurrentCycle")} />
                </span>
              </TooltipTrigger>
              <TooltipContent>{tCycles("inCurrentCycle")}</TooltipContent>
            </Tooltip>
          )}
          <IntegrationIndicator issue={issue} iconClassName="size-3" />
          {parentNumber != null &&
            (onOpenParent ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    onOpenParent();
                  }}
                  onPointerDown={stop}
                  aria-label={t("openParentAria", {
                    id: issueIdentifier(projectKey, parentNumber),
                  })}
                  className="rounded-sm transition-colors hover:text-foreground hover:underline"
                >
                  {issueIdentifier(projectKey, parentNumber)}
                </button>
                <ChevronRight className="size-3 shrink-0" aria-hidden />
              </>
            ) : (
              <>
                <span>{issueIdentifier(projectKey, parentNumber)}</span>
                <ChevronRight className="size-3 shrink-0" aria-hidden />
              </>
            ))}
          <span className="truncate">{issueIdentifier(projectKey, issue.number)}</span>
          {relations && relations.length > 0 && (
            <RelationChips
              relations={relations}
              projectKey={projectKey}
              onOpen={onOpenRelated}
              max={1}
              className="shrink-0"
            />
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* PR disponible → remplace l'indicateur de plan ; sinon le plan. */}
          {pr ? (
            <PrPick onOpen={onOpenPr} />
          ) : plan.total > 0 ? (
            <PlanPick progress={plan} onOpen={onOpenPlan} />
          ) : null}
          <AssigneePick
            assignee={assignee}
            members={[...memberMap.values()]}
            onChange={setAssignee}
          />
        </span>
      </div>

      {/* Title + description (tight spacing between them, and to the row above) */}
      <div className="-mt-1 flex flex-col gap-0.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {issue.title}
        </p>
        {description && (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {/* Indicators — spread edge-to-edge: status · priority · effort · category */}
      <div className="flex items-center justify-between pt-0.5">
        <StatusPick value={issue.status} onChange={setStatus} />
        <PriorityPick value={issue.priority} onChange={setPriority} />
        <EffortPick value={issue.effort} onChange={setEffort} />
        <CategoryPick
          categories={[...categoryMap.values()]}
          selectedIds={issue.category_ids}
          onChange={onSetCategories}
        />
      </div>

      {/* Bottom line — linked objective (left) + due date (right) */}
      {(objective || issue.due_date) && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center">
            {objective && <ObjectiveIndicator objective={objective} />}
          </div>
          {issue.due_date && (
            <div className="shrink-0">
              <DueDatePick value={issue.due_date} onChange={setDueDate} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function IssueCard({
  issue,
  projectId,
  projectKey,
  project,
  memberMap,
  categoryMap,
  objectiveMap,
  parentNumber,
  relations,
  candidateIssues,
  onOpenParent,
  onOpenRelated,
  onAddRelation,
  onOpenPlan,
  onOpen,
  onUpdateIssue,
  onSetCategories,
  extraActions,
  inCurrentCycle,
  selected,
  onSelect,
}: {
  issue: Issue;
  projectId: string;
  projectKey: string;
  /** Cross-project boards: the issue's project (shows an origin-project chip). */
  project?: Project;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  objectiveMap?: Map<string, Objective>;
  parentNumber?: number;
  relations?: ChipRelation[];
  /** All project issues — candidates for the "add relation" picker. */
  candidateIssues?: Issue[];
  onOpenParent?: () => void;
  onOpenRelated?: (issueId: string) => void;
  /** Adds a relation from this issue (source) to the picked target. When set,
      the right-click menu gains the three "mark as…" relation actions. */
  onAddRelation?: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string
  ) => void;
  onOpenPlan?: () => void;
  onOpen: () => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
  /** Board-provided right-click actions appended to the menu (e.g. the cycle
      add/remove actions — MIN-32). */
  extraActions?: ContextMenuAction[];
  /** The issue belongs to MY current cycle — forwarded to the card body. */
  inCurrentCycle?: boolean;
  selected?: boolean;
  onSelect?: (issueId: string) => void;
}) {
  const t = useTranslations("IssueUI");
  const tRel = useTranslations("Relations");
  const tAttach = useTranslations("Attachments");
  const tAgent = useTranslations("Agent");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.id });
  const agentActive = useAgentActive(issue.id);
  // Une run d'agent est ACTIVE sur l'issue → l'action OUVRE sa conversation. Sinon
  // (aucune run, ou toutes terminées) elle en LANCE une nouvelle, à froid (MIN-68).
  const agentHasSession = useAgentHasSession(issue.id);
  const { agentsAllowed } = usePlanGates();
  // PR disponible pour ce ticket → chip « PR disponible » sur la carte + option menu.
  const pr = useAgentPr(issue.id);
  const router = useRouter();
  const openPr = pr
    ? () => router.push(`/pull-requests?run=${pr.runId}`)
    : undefined;

  // Drop de fichiers depuis l'OS directement sur la carte (MIN-24) — chaque
  // fichier est enregistré sur l'issue dès que son upload aboutit. Distinct du
  // drag dnd-kit (pointer events) : aucun conflit.
  const identifier = issueIdentifier(projectKey, issue.number);
  const uploads = useAttachmentUploads(() => `projects/${issue.project_id}`, {
    onUploaded: (input, localId) => {
      addIssueAttachmentsApi(issue.id, [input])
        .then(() => {
          void queryClient.invalidateQueries({
            queryKey: ["issue-attachments", issue.id],
          });
          toast.success(tAttach("addedTo", { id: identifier }));
        })
        .catch((e) => toast.error((e as Error).message))
        .finally(() => uploads.remove(localId));
    },
  });
  const drop = useFileDrop(uploads.addFiles);
  // Menu contextuel (clic droit) — position viewport du pointeur, null = fermé.
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(
    null
  );
  // Position mémorisée du dernier clic droit : le picker de relation s'ouvre au
  // même endroit que le menu qui vient de se fermer.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  // Relation en cours d'ajout (type choisi) → ouvre le picker de cible.
  const [relationType, setRelationType] = useState<IssueRelationType | null>(null);
  // Agent de code sur ce ticket (MIN-46) — menu clic droit + raccourci ⇧A. Redirige
  // vers la page Agents plutôt que d'ouvrir une modal. Deux points d'entrée :
  //  • openAgentSession — rouvre la session existante (sa run la plus active, `?issue=`) ;
  //  • startNewAgentSession — pose un brouillon de composition optimiste et ouvre son
  //    composer (`?compose=`), lançant une session NEUVE même si le ticket en a déjà
  //    une (nouvelle run sur le ticket), exactement comme le bouton du panneau d'issue.
  const openAgentSession = () => {
    router.push(`/agents?issue=${issue.id}`);
  };
  const startNewAgentSession = () => {
    // « Nouvelle session » sur un ticket DÉJÀ pourvu (branche/PR/contexte hérités) →
    // composer VIERGE : l'utilisateur dicte lui-même la consigne. Premier lancement à
    // froid → prompt d'amorçage (contexte du ticket, adapté à son plan / effort).
    const prompt = agentHasSession
      ? ""
      : `${tAgent("launchPrompt.head", { identifier, title: issue.title })}\n\n${tAgent(`launchPrompt.${agentLaunchPromptVariant(issue)}`)}`;
    setAgentComposeDraft({
      issueId: issue.id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      projectId: issue.project_id,
      projectKey,
      prompt,
    });
    router.push(`/agents?compose=${issue.id}`);
  };
  // ⇧A : ticket déjà pourvu d'une session → on l'ouvre ; sinon on en démarre une neuve.
  // Plan sans agents (MIN-72) : le raccourci est inerte, les entrées de menu absentes.
  const launchAgent = () => {
    if (!agentsAllowed) return;
    if (agentHasSession) openAgentSession();
    else startNewAgentSession();
  };

  // Candidats du picker : les autres issues OUVERTES du projet, hors celles
  // déjà liées — lier à du travail terminé/annulé n'a pas de sens (un bloqueur
  // clos ne bloque plus).
  const relationCandidates = useMemo(() => {
    if (!candidateIssues) return [];
    const linked = new Set((relations ?? []).map((r) => r.otherId));
    return candidateIssues.filter(
      (i) => i.id !== issue.id && !linked.has(i.id) && !isClosedStatus(i.status)
    );
  }, [candidateIssues, relations, issue.id]);
  const copyPrompt = async () => {
    // MIN-20 : copier le prompt démarre le ticket (option activée par défaut,
    // désactivable dans Compte → Préférences). On n'avance que les statuts
    // pré-travail, et le toast ne signale le déplacement que s'il a eu lieu.
    const autoStart =
      resolvePromptCopyAutoStart(user?.user_metadata) &&
      shouldAutoStartOnPromptCopy(issue.status);
    // Le XML copié doit refléter l'état RÉEL après déplacement : si on passe le
    // ticket « En cours », le prompt le décrit déjà `in_progress`, pas l'ancien.
    const promptIssue = autoStart
      ? { ...issue, status: "in_progress" as const }
      : issue;
    // Relations de l'issue (type + identifiant + titre de l'autre issue) — le
    // titre est résolu depuis candidateIssues (la liste complète du projet),
    // qui n'existe que dans l'app authentifiée : aucune fuite côté board public.
    const titleById = new Map((candidateIssues ?? []).map((i) => [i.id, i.title]));
    const promptRelations = (relations ?? []).map((r) => ({
      type: r.relation,
      identifier: issueIdentifier(projectKey, r.otherNumber),
      title: titleById.get(r.otherId) ?? "",
    }));
    // Noms des catégories (les IDs vivent sur l'issue, les noms dans categoryMap).
    const promptCategories = issue.category_ids
      .map((cid) => categoryMap.get(cid)?.name)
      .filter((name): name is string => !!name);
    const prompt = buildIssuePrompt({
      issue: promptIssue,
      projectId,
      projectKey,
      categories: promptCategories,
      relations: promptRelations,
      attachmentCount: issue.attachment_count,
    });
    await navigator.clipboard.writeText(prompt);
    if (autoStart) {
      onUpdateIssue(issue.id, { status: "in_progress" });
      toast.success(t("promptCopiedMoved"));
    } else {
      toast.success(t("promptCopied"));
    }
  };

  // Raccourcis clavier au survol : S/P/E/A/L/D/O ouvrent le picker au curseur,
  // Espace ouvre le ticket (comme un clic), Shift+P copie le prompt, Shift+A
  // ouvre l'agent (la dernière conversation du ticket, ou un composer vierge).
  const { containerProps, menuState, closeMenu } = useIssueFieldShortcuts(
    !isDragging,
    {
      " ": onOpen,
      "shift+p": () => void copyPrompt(),
      "shift+a": launchAgent,
    }
  );

  const menuActions: ContextMenuAction[] = [
    {
      id: "copy-prompt",
      label: t("copyAsPrompt"),
      keywords: ["copy", "prompt", "agent", "copier"],
      icon: <ClipboardCopy className="size-4" />,
      shortcut: "⇧P",
      onSelect: () => void copyPrompt(),
    },
    // Agent de code sur ce ticket, sur la PAGE Agents. Session existante → deux
    // entrées : « Ouvrir l'agent » (rouvre la session, sa run la plus active) et
    // « Nouvelle session » (compose une run neuve sur le ticket). Aucune session →
    // une seule entrée « Lancer un agent » (compose à froid). ⇧A = 1re action.
    ...(!agentsAllowed
      ? []
      : agentHasSession
        ? [
            {
              id: "open-agent",
              label: tAgent("openAgent"),
              keywords: ["agent", "open", "ouvrir", "session", "code", "ai", "numo"],
              icon: <NumoIcon className="size-4" />,
              shortcut: "⇧A",
              onSelect: openAgentSession,
            },
            {
              id: "new-agent-session",
              label: tAgent("newSession"),
              keywords: ["agent", "new", "nouvelle", "session", "launch", "lancer", "numo"],
              icon: <Plus className="size-4" />,
              onSelect: startNewAgentSession,
            },
          ]
        : [
            {
              id: "launch-agent",
              label: tAgent("menuLaunch"),
              keywords: ["agent", "launch", "lancer", "code", "ai", "numo"],
              icon: <NumoIcon className="size-4" />,
              shortcut: "⇧A",
              onSelect: startNewAgentSession,
            },
          ]),
    // Ouvrir la pull request — proposé uniquement quand une PR existe pour le ticket.
    ...(agentsAllowed && pr && openPr
      ? [
          {
            id: "open-pr",
            label: tAgent("viewPullRequest"),
            keywords: ["pull request", "pr", "review", "github", "merge"],
            icon: <GitPullRequest className="size-4" />,
            onSelect: openPr,
          },
        ]
      : []),
    // Relations (MIN-25 / MIN-30): grouped under a "Relations" submenu. Each
    // leaf opens the target-issue picker at the pointer. Shown only when the
    // board wired the relation handlers.
    ...(onAddRelation
      ? [
          {
            id: "relations",
            label: tRel("relations"),
            keywords: ["relation", "link", "lier", "bloc", "block"],
            icon: <Link2 className="size-4" />,
            children: RELATION_TYPES.map((type) => ({
              id: `relation-${type}`,
              label: tRel(`action_${type}`),
              keywords: [tRel(type), "relation", "link", "lier"],
              icon: <RelationIcon relation={type} className="size-4" />,
              onSelect: () => setRelationType(type),
            })),
          },
        ]
      : []),
    ...(extraActions ?? []),
  ];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      {...containerProps}
      onClick={(e) => {
        if (e.shiftKey && onSelect) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(issue.id);
          return;
        }
        onOpen();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        pointerRef.current = { x: e.clientX, y: e.clientY };
        setMenuPosition(pointerRef.current);
      }}
      {...drop.handlers}
      // No touch-action override: drag-and-drop is mouse-only (MouseSensor), so
      // touch is free to scroll the board/columns natively.
      className={cn(
        "relative cursor-pointer rounded-xl",
        isDragging && "opacity-40",
      )}
    >
      <DropOverlay
        show={drop.dragging}
        label={tAttach("dropOnIssue", { id: identifier })}
      />
      {/* Upload dropped on the card still in flight — discreet corner spinner. */}
      {!drop.dragging && uploads.pending.length > 0 && (
        <span className="absolute right-2 top-2 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-card shadow-sm">
          <Spinner className="size-3" />
        </span>
      )}
      {(() => {
        const body = (
          <IssueCardBody
            issue={issue}
            projectKey={projectKey}
            project={project}
            memberMap={memberMap}
            categoryMap={categoryMap}
            objectiveMap={objectiveMap}
            parentNumber={parentNumber}
            relations={relations}
            onOpenParent={onOpenParent}
            onOpenRelated={onOpenRelated}
            onOpenPlan={onOpenPlan}
            pr={pr}
            onOpenPr={openPr}
            onUpdate={(patch) => onUpdateIssue(issue.id, patch)}
            onSetCategories={(ids) => onSetCategories(issue.id, ids)}
            inCurrentCycle={inCurrentCycle}
            selected={selected}
          />
        );
        // Agent en cours : liseré animé qui parcourt le bord (wrapper `AgentBeam`
        // partagé). Le wrapper a `overflow: hidden` → on lui reporte le `shadow-sm`.
        return (
          <AgentBeam active={agentActive} className="rounded-xl shadow-sm">
            {body}
          </AgentBeam>
        );
      })()}
      <IssueContextMenu
        position={menuPosition}
        onClose={() => setMenuPosition(null)}
        actions={menuActions}
      />
      <RelationTargetPicker
        position={relationType ? pointerRef.current : null}
        relation={relationType}
        issues={relationCandidates}
        projectKey={projectKey}
        onClose={() => setRelationType(null)}
        onSelect={(targetId) => {
          if (relationType) onAddRelation?.(issue.id, relationType, targetId);
          setRelationType(null);
        }}
      />
      <IssueShortcutMenu
        state={menuState}
        onClose={closeMenu}
        issue={issue}
        members={[...memberMap.values()]}
        categories={[...categoryMap.values()]}
        objectives={objectiveMap ? [...objectiveMap.values()] : []}
        onUpdate={(patch) => onUpdateIssue(issue.id, patch)}
        onSetCategories={(ids) => onSetCategories(issue.id, ids)}
      />
    </div>
  );
}
