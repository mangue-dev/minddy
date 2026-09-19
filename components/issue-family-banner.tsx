"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { ChevronLeft, Network } from "lucide-react";
import { AppContentHeader } from "@/components/app-content-header";
import { issueIdentifier } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

/** Content header shown while a board is scoped to one issue family. */
export function IssueFamilyBoardHeader({
  parent,
  projectKey,
  childCount,
  exitHref,
}: {
  parent: Issue;
  projectKey: string;
  childCount: number;
  exitHref: string;
}) {
  const t = useTranslations("IssueFamily");

  return (
    <AppContentHeader contentClassName="gap-3">
      <Button asChild variant="ghost" size="icon-sm">
        <Link href={exitHref} aria-label={t("backToBoard")}>
          <ChevronLeft />
        </Link>
      </Button>
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <Network className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {issueIdentifier(projectKey, parent.number)}
          </span>
          <span className="truncate font-medium">{parent.title}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("childCount", { count: childCount })}
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="ml-auto shrink-0">
        <Link href={exitHref}>{t("backToBoard")}</Link>
      </Button>
    </AppContentHeader>
  );
}
