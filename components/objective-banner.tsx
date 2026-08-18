"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { Member, Objective } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The name of the banner is a SELECTOR: from one objective board, we move to the next
 * without going through the list of objectives again. The same searchable picker
 * as everywhere else (color patch included), on a bare trigger —
 * the title remains a title, an chevron says that it opens.
 *
 * Changing objective is CHANGE URL (`?objective=`): this is what parameter,
 * and it alone, which frames the board. A `push` rather than a `replace`, so that
 * backtracking takes you back to the goal before.
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
  const router = useRouter();
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
        router.push(`/projects/${projectId}?objective=${id}`);
      }}
      options={options}
      align="start"
      tooltip={t("switchObjective")}
      searchPlaceholder={t("filterPlaceholder", { count: objectives.length })}
      trigger={
        <button
          type="button"
          aria-label={t("switchObjective")}
          className="-ml-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium leading-tight outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
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
  /** All project goals — the title selector list. */
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

  // Late only while the objective is still open, and only once the whole target
  // day has passed (a date-only target is local midnight — don't flag it "late"
  // on its own due day).
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue =
    targetDate !== null &&
    targetDate < startOfToday &&
    objective.status !== "done" &&
    objective.status !== "canceled";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-border bg-card px-4 py-3">
      {/* Identity — color dot · name · status */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
          aria-hidden
        />
        <div className="min-w-0">
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
        {/* The ring takes the place — and the exact size — of the round dots
 of the manager and the target date: the three indicators of the banner
 are then read on the same grid, a circle then two lines.
 The horizontal bar from before demanded its own width and broke
 this row. The percentage is hovered over: it is
 the weighted EFFORT, when the account next to it is raw. */}
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
        {/* Modify is GO to the objective (MIN-226): it has its page, and the
 panel which was placed here on top of the board no longer exists. A real
 link, therefore — openable in a tab like any other. */}
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
