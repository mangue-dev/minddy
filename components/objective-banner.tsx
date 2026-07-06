"use client";

import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { Button, Progress } from "mangue-ui";
import { Pencil, X } from "lucide-react";
import { OBJECTIVE_STATUS_MAP } from "@/lib/objective-constants";
import { initials } from "@/lib/avatar";
import { displayName } from "@/lib/display-name";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import type { Member, Objective } from "@/lib/types";

/** Header banner shown when the board is filtered to a single objective (plan §6). */
export function ObjectiveBanner({
  objective,
  projectId,
  progress,
  lead,
  onEdit,
}: {
  objective: Objective;
  projectId: string;
  progress: { done: number; total: number; percent: number };
  lead: Member | null;
  onEdit: () => void;
}) {
  const t = useTranslations("Objectives");
  const tCommon = useTranslations("Common");
  const tStatus = useTranslations("ObjectiveStatus");
  const format = useFormatter();
  const status = OBJECTIVE_STATUS_MAP[objective.status];
  const StatusIcon = status.icon;
  const targetDate = parseDueDate(objective.target_date);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: objective.color ?? "var(--muted-foreground)" }}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="truncate font-medium">{objective.name}</p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <StatusIcon className={`size-3.5 ${status.color}`} />
          <span className="text-xs text-muted-foreground">{tStatus(status.value)}</span>
        </div>
      </div>

      <div className="flex w-40 flex-col gap-1">
        <Progress value={progress.percent} />
        <span className="text-xs text-muted-foreground">
          {t("completed", { done: progress.done, total: progress.total })}
        </span>
      </div>

      {targetDate && (
        <span className="text-xs text-muted-foreground">
          {t("targetDate")} {format.dateTime(targetDate, dueDateFormat(targetDate))}
        </span>
      )}
      {lead && (
        <span
          className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
          title={displayName(lead)}
        >
          {initials(displayName(lead))}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil />
          {tCommon("edit")}
        </Button>
        <Button asChild variant="ghost" size="icon-sm" aria-label={t("closeFilter")}>
          <Link href={`/projects/${projectId}`}>
            <X />
          </Link>
        </Button>
      </div>
    </div>
  );
}
