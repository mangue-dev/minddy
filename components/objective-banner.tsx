"use client";

import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { Button, Progress, cn } from "mangue-ui";
import { Pencil, X, Target } from "lucide-react";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import type { Member, Objective } from "@/lib/types";

/** Header banner shown when the board is filtered to a single objective (plan §6). */
export function ObjectiveBanner({
  objective,
  projectId,
  progress,
  lead,
}: {
  objective: Objective;
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
          <p className="truncate font-medium leading-tight">{objective.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <StatusIcon className={`size-3.5 ${status.color}`} />
            <span className="text-xs text-muted-foreground">{tStatus(status.value)}</span>
          </div>
        </div>
      </div>

      <div className="hidden h-9 w-px shrink-0 bg-border sm:block" aria-hidden />

      {/* Indicators — progress · lead · target */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex w-32 flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t("completed", { done: progress.done, total: progress.total })}
            </span>
            <span className="font-semibold tabular-nums">{progress.percent}%</span>
          </div>
          <Progress value={progress.percent} />
        </div>

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
        {/* Modifier, c'est ALLER à l'objectif (MIN-226) : il a sa page, et le
            panneau qui se posait ici par-dessus le board n'existe plus. Un vrai
            lien, donc — ouvrable dans un onglet comme n'importe quel autre. */}
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
