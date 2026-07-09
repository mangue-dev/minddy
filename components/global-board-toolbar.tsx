"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";
import { ArrowUpDown, Check, ListFilter, Triangle } from "lucide-react";
import {
  StatusIndicator,
  PriorityIndicator,
} from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import {
  STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { activeFilterCount } from "@/lib/view-filter";
import { displayName } from "@/lib/display-name";
import type {
  Member,
  Onglet,
  ViewConfig,
  ViewFilters,
  ViewSort,
} from "@/lib/types";

const SORTS: ViewSort[] = ["manual", "priority", "created", "updated", "due"];

function toggle<T>(arr: T[] | undefined, value: T): T[] {
  const set = new Set(arr ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

function ToggleRow({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {active && <Check className="size-4 shrink-0" />}
    </button>
  );
}

/**
 * Filter + sort controls for the cross-project boards (MIN-29). A trimmed cousin
 * of <BoardToolbar>: no saved views, no Numo, and only the facets that mean the
 * same thing across every project — status, priority, effort, hide-done, plus
 * assignee on the "All" board. State is ephemeral (persisted to localStorage by
 * the board), not backed by a DB view.
 */
export function GlobalBoardToolbar({
  scope,
  config,
  onConfigChange,
  members,
}: {
  scope: Onglet;
  config: ViewConfig;
  onConfigChange: (config: ViewConfig) => void;
  /** Deduped union of members across projects (the "All" board's assignee filter). */
  members: Member[];
}) {
  const [open, setOpen] = useState(false);
  const f = config.filters;
  const setFilters = (next: ViewFilters) =>
    onConfigChange({ ...config, filters: next });
  const count = activeFilterCount(config);

  const t = useTranslations("Board");
  const tc = useTranslations("Common");
  const tf = useTranslations("Field");
  const ts = useTranslations("Status");
  const tp = useTranslations("Priority");
  const tSort = useTranslations("Sort");

  return (
    <div className="flex items-center gap-1.5">
      {/* Sort — icon only, accent-coloured for any non-default order */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label={tf("order")}>
                <ArrowUpDown
                  className={cn(config.sort !== "manual" && "text-primary")}
                />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{tf("order")}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {SORTS.map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() => onConfigChange({ ...config, sort: s })}
            >
              {tSort(s)}
              {config.sort === s && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filters — icon only, accent-coloured when any filter is active */}
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label={tc("filters")}>
                <ListFilter className={cn(count > 0 && "text-primary")} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{tc("filters")}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="max-h-[70vh] w-64 overflow-y-auto p-2"
        >
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {tf("status")}
          </p>
          {STATUSES.map((s) => (
            <ToggleRow
              key={s.value}
              active={!!f.status?.includes(s.value)}
              onClick={() =>
                setFilters({ ...f, status: toggle<IssueStatus>(f.status, s.value) })
              }
            >
              <StatusIndicator status={s.value} className="size-4" />
              {ts(s.value)}
            </ToggleRow>
          ))}

          <Separator className="my-1.5" />
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {tf("priority")}
          </p>
          {PRIORITIES.map((p) => (
            <ToggleRow
              key={p.value}
              active={!!f.priority?.includes(p.value)}
              onClick={() =>
                setFilters({
                  ...f,
                  priority: toggle<IssuePriority>(f.priority, p.value),
                })
              }
            >
              <PriorityIndicator priority={p.value} className="size-4" />
              {tp(p.value)}
            </ToggleRow>
          ))}

          {scope === "all" && members.length > 0 && (
            <>
              <Separator className="my-1.5" />
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {tf("assignee")}
              </p>
              <ToggleRow
                active={!!f.assignee?.includes(null)}
                onClick={() =>
                  setFilters({ ...f, assignee: toggle(f.assignee, null) })
                }
              >
                {tf("unassigned")}
              </ToggleRow>
              {members.map((m) => (
                <ToggleRow
                  key={m.user_id}
                  active={!!f.assignee?.includes(m.user_id)}
                  onClick={() =>
                    setFilters({ ...f, assignee: toggle(f.assignee, m.user_id) })
                  }
                >
                  <UserAvatar
                    url={m.avatar_url}
                    name={displayName(m)}
                    seed={m.user_id}
                    className="size-5 text-[9px]"
                  />
                  <span className="truncate">{displayName(m)}</span>
                </ToggleRow>
              ))}
            </>
          )}

          <Separator className="my-1.5" />
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {tf("effort")}
          </p>
          {EFFORTS.map((e) => (
            <ToggleRow
              key={e.value}
              active={!!f.effort?.includes(e.value)}
              onClick={() =>
                setFilters({ ...f, effort: toggle<IssueEffort>(f.effort, e.value) })
              }
            >
              <Triangle className="size-4 text-muted-foreground" />
              {e.label}
            </ToggleRow>
          ))}

          <Separator className="my-1.5" />
          <ToggleRow
            active={!!config.display.hideDone}
            onClick={() =>
              onConfigChange({
                ...config,
                display: { ...config.display, hideDone: !config.display.hideDone },
              })
            }
          >
            {t("hideDone")}
          </ToggleRow>
        </PopoverContent>
      </Popover>
    </div>
  );
}
