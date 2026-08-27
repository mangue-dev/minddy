"use client";

import { startTransition } from "react";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import {
  Button,
  cn,
} from "mangue-ui";
import { ChevronDown, Pencil, X, Target } from "lucide-react";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { Dot } from "@/components/issue-property-fields";
import { ProgressRing } from "@/components/progress-ring";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import { pushObjectiveBoardHistory } from "@/lib/objective-board-navigation";
import type { Member, Objective } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The banner title doubles as a selector so users can move directly between
 * objective boards. It reuses the standard searchable picker and keeps a bare
 * title-style trigger, with a chevron as the only affordance.
 *
 * The `?objective=` URL parameter is the source of truth for the board filter.
 * Each change pushes a history entry so Back returns to the previous objective.
 */
function ObjectiveSwitch({
  objective,
  objectives,
  projectId,
}: {
  objective: Objective;
  objectives: Objective[];
  projectId: string;
}) {
  const t = useTranslations("Objectives");
  const options: PickerOption[] = objectives.map((o) => ({
    value: o.id,
    label: o.name,
    icon: <Dot color={o.color} />,
  }));
  return (
    <SearchSelect
      value={objective.id}
      onChange={(id) => {
        if (!id || id === objective.id) return;
        startTransition(() => pushObjectiveBoardHistory(projectId, id));
      }}
      options={options}
      align="start"
      tooltip={t("switchObjective")}
      searchPlaceholder={t("filterPlaceholder", { count: objectives.length })}
      trigger={
        <button
          type="button"
          aria-label={t("switchObjective")}
          className="flex max-w-full -translate-x-1.5 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium leading-tight outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
        >
          <span className="truncate">{objective.name}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      }
    />
  );
}

/** Header banner shown when the board is filtered to a single objective (plan §6). */
export function ObjectiveBanner({
  objective,
  objectives,
  projectId,
  progress,
  lead,
}: {
  objective: Objective;
  /** All project objectives shown in the title selector. */
  objectives: Objective[];
  projectId: string;
  progress: { done: number; total: number; percent: number };
  lead: Member | null;
}) {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tStatus = useTranslations("ObjectiveStatus");
  const format = useFormatter();
  const status = OBJECTIVE_STATUS_MAP[objective.status];
  const StatusIcon = status.icon;
  const targetDate = parseDueDate(objective.target_date);

  // Only open objectives become overdue, and only after the entire target day
  // has passed. A date-only target resolves to local midnight, so it must not be
  // flagged as overdue during its own due day.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue =
    targetDate !== null &&
    targetDate < startOfToday &&
    objective.status !== "done" &&
    objective.status !== "canceled";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-card px-4 py-3">
      {/* Identity: color dot, name, and status. */}
      <div className="flex min-w-0 max-w-full shrink-0 items-center gap-3">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <ObjectiveSwitch
            objective={objective}
            objectives={objectives}
            projectId={projectId}
          />
          <div className="flex items-center gap-1.5">
            <StatusIcon className={`size-3.5 ${status.color}`} />
            <span className="text-xs text-muted-foreground">{tStatus(status.value)}</span>
          </div>
        </div>
      </div>

      <div className="hidden h-9 w-px shrink-0 bg-border sm:block" aria-hidden />

      {/* Indicators — progress · lead · target */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* The ring matches the lead avatar and target-date icon so all three
        indicators share the same visual grid: a circle followed by two lines.
        The percentage lives in the tooltip because it is effort-weighted,
        whereas the adjacent completed count is unweighted. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <ProgressRing
                percent={progress.percent}
                colorClass="text-emerald-500"
                className="size-7"
              />
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] text-muted-foreground">
                  {t("progressLabel")}
                </span>
                <span className="text-xs font-medium tabular-nums">
                  {t("completed", { done: progress.done, total: progress.total })}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {t("progressTooltip", { percent: progress.percent })}
          </TooltipContent>
        </Tooltip>

        {lead && (
          <div className="flex items-center gap-2">
            <UserAvatar
              seed={lead.avatar_seed}
              title={displayName(lead)}
              className="size-7"
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="text-[11px] text-muted-foreground">
                {t("leadFieldLabel")}
              </span>
              <span className="max-w-[9rem] truncate text-xs font-medium">
                {displayName(lead)}
              </span>
            </div>
          </div>
        )}

        {targetDate && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full",
                overdue
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground"
              )}
              aria-hidden
            >
              <Target className="size-3.5" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] text-muted-foreground">
                {t("targetDatePlaceholder")}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  overdue && "text-destructive"
                )}
              >
                {format.dateTime(targetDate, dueDateFormat(targetDate))}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Editing navigates to the objective page (MIN-226), so this remains a
        real link that can be opened in a new tab. */}
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${projectId}/objectives?open=${objective.id}`}>
            <Pencil />
            {tCommon("edit")}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/projects/${projectId}`} title={t("closeFilter")}>
            <X />
            {tCommon("close")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
