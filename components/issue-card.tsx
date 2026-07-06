"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations, useFormatter } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";
import { Calendar, Check, Triangle, User } from "lucide-react";
import {
  STATUSES,
  PRIORITIES,
  EFFORTS,
  issueIdentifier,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import {
  StatusIndicator,
  PriorityIndicator,
  EffortIndicator,
} from "@/components/issue-indicators";
import type { Category, Issue, IssueUpdateInput, Member } from "@/lib/types";

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
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("changeStatusAria")}
              onClick={stop}
              onPointerDown={stop}
              className={TRIGGER_CLASS}
            >
              <StatusIndicator status={value} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tField("status")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-44"
        onClick={stop}
        onPointerDown={stop}
      >
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)}>
            <StatusIndicator status={s.value} className="size-4" />
            {tStatus(s.value)}
            {s.value === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("changePriorityAria")}
              onClick={stop}
              onPointerDown={stop}
              className={TRIGGER_CLASS_LG}
            >
              <PriorityIndicator priority={value} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tField("priority")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-44"
        onClick={stop}
        onPointerDown={stop}
      >
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p.value} onSelect={() => onChange(p.value)}>
            <PriorityIndicator priority={p.value} className="size-4" />
            {tPriority(p.value)}
            {p.value === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
      <Triangle className="size-3.5 shrink-0" />
      <span className="text-xs font-medium leading-none">–</span>
    </span>
  );
  if (!onChange) return display;
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("changeEffortAria")}
              onClick={stop}
              onPointerDown={stop}
              className={TRIGGER_CLASS_LG}
            >
              {display}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tField("effort")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="w-40"
        onClick={stop}
        onPointerDown={stop}
      >
        <DropdownMenuItem onSelect={() => onChange(null)}>{tCommon("none")}</DropdownMenuItem>
        {EFFORTS.map((e) => (
          <DropdownMenuItem key={e.value} onSelect={() => onChange(e.value)}>
            {e.label}
            {e.value === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    );

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("editCategoriesAria")}
              onClick={stop}
              onPointerDown={stop}
              className={TRIGGER_CLASS_LG}
            >
              {display}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tField("categories")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={stop}
        onPointerDown={stop}
      >
        {categories.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            {t("noCategoriesHint")}
          </div>
        ) : (
          categories.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={(e) => {
                e.preventDefault();
                toggle(c.id);
              }}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              <span className="truncate">{c.name}</span>
              {selectedIds.includes(c.id) && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("changeAssigneeAria")}
              onClick={stop}
              onPointerDown={stop}
              className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
            >
              {avatar}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{tField("assignee")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={stop}
        onPointerDown={stop}
      >
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {tField("unassigned")}
          {!assignee && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.user_id} onSelect={() => onChange(m.user_id)}>
            <UserAvatar
              url={m.avatar_url}
              name={displayName(m)}
              seed={m.user_id}
              className="size-5 text-[9px]"
            />
            <span className="truncate">{displayName(m)}</span>
            {m.user_id === assignee?.user_id && (
              <Check className="ml-auto size-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const display = (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Calendar className="size-3 shrink-0" />
      {format.dateTime(new Date(value + "T00:00:00"), { day: "numeric", month: "short" })}
    </span>
  );
  if (!onChange) return display;
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("changeDueDateAria")}
              onClick={stop}
              onPointerDown={stop}
              className="-m-1 flex items-center rounded-md p-1 outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
            >
              {display}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tField("dueDate")}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-auto p-2"
        onClick={stop}
        onPointerDown={stop}
      >
        <div className="flex flex-col gap-2">
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value || null)}
            className="rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("removeDueDate")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Presentational card body — shared by the sortable card and the drag overlay. */
export function IssueCardBody({
  issue,
  projectKey,
  memberMap,
  categoryMap,
  onUpdate,
  onSetCategories,
  dragging,
}: {
  issue: Issue;
  projectKey: string;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  /** When set, the status/priority/effort/assignee/due indicators become pickers. */
  onUpdate?: (patch: IssueUpdateInput) => void;
  /** When set, the category indicator becomes an inline multi-select picker. */
  onSetCategories?: (ids: string[]) => void;
  dragging?: boolean;
}) {
  const assignee = issue.assignee_id
    ? memberMap.get(issue.assignee_id) ?? null
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
        "flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left shadow-sm",
        dragging && "cursor-grabbing shadow-lg"
      )}
    >
      {/* Identifier + assignee */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {issueIdentifier(projectKey, issue.number)}
        </span>
        <AssigneePick
          assignee={assignee}
          members={[...memberMap.values()]}
          onChange={setAssignee}
        />
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

      {/* Due date — its own line, right-aligned (no empty state) */}
      {issue.due_date && (
        <div className="flex items-center justify-end pt-0.5">
          <DueDatePick value={issue.due_date} onChange={setDueDate} />
        </div>
      )}
    </div>
  );
}

export function IssueCard({
  issue,
  projectKey,
  memberMap,
  categoryMap,
  onOpen,
  onUpdateIssue,
  onSetCategories,
}: {
  issue: Issue;
  projectKey: string;
  memberMap: Map<string, Member>;
  categoryMap: Map<string, Category>;
  onOpen: () => void;
  onUpdateIssue: (issueId: string, patch: IssueUpdateInput) => void;
  onSetCategories: (issueId: string, ids: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn("cursor-pointer touch-none", isDragging && "opacity-40")}
    >
      <IssueCardBody
        issue={issue}
        projectKey={projectKey}
        memberMap={memberMap}
        categoryMap={categoryMap}
        onUpdate={(patch) => onUpdateIssue(issue.id, patch)}
        onSetCategories={(ids) => onSetCategories(issue.id, ids)}
      />
    </div>
  );
}
