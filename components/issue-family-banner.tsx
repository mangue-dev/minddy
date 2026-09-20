"use client";

import { useTranslations } from "next-intl";
import { AppContentHeader } from "@/components/app-content-header";
import { ProgressRing } from "@/components/progress-ring";
import { issueIdentifier } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

/** Content header shown while a board is scoped to one issue family. */
export function IssueFamilyBoardHeader({
  parent,
  projectKey,
  childCount,
  completedChildCount,
}: {
  parent: Issue;
  projectKey: string;
  childCount: number;
  completedChildCount: number;
}) {
  const t = useTranslations("IssueFamily");
  const percent = childCount === 0
    ? 0
    : Math.round((completedChildCount / childCount) * 100);

  return (
    <AppContentHeader contentClassName="gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {issueIdentifier(projectKey, parent.number)}
          </span>
          <span className="truncate font-medium">{parent.title}</span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ProgressRing
            percent={percent}
            colorClass="text-emerald-500"
            className="size-3.5"
          />
          {t("childCount", { count: childCount })}
        </p>
      </div>
    </AppContentHeader>
  );
}
