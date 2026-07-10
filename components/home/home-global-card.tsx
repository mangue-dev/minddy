"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  CircleDot,
  Timer,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "mangue-ui";
import { useGlobalBoardQuery } from "@/lib/use-global-board-query";
import { useAuth } from "@/lib/auth-context";
import type { IssueStatus } from "@/lib/issue-constants";

/** Statuses that keep an issue "in play" — mirrors ProjectCard's open bucket,
    minus triage (triage sits before the board and is counted on its own). */
const CLOSED: IssueStatus[] = ["done", "canceled", "duplicate"];
const isOpen = (s: IssueStatus) => !CLOSED.includes(s) && s !== "triage";

function StatRow({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-[2ch] font-medium tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export function HomeGlobalCard() {
  const t = useTranslations("Home");
  const { issues, loading } = useGlobalBoardQuery();
  const { user } = useAuth();
  const myId = user?.id ?? null;

  const counts = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let mine = 0;
    for (const i of issues) {
      if (i.status === "in_progress") inProgress += 1;
      if (isOpen(i.status)) {
        open += 1;
        if (myId && i.assignee_id === myId) mine += 1;
      }
    }
    return { open, inProgress, mine };
  }, [issues, myId]);

  return (
    <section className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <h2 className="text-sm font-semibold tracking-tight">{t("globalTitle")}</h2>

      <div className="flex flex-1 flex-col gap-2">
        {loading ? (
          <>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-36" />
          </>
        ) : (
          <>
            <StatRow icon={CircleDot} value={counts.open} label={t("globalOpen")} />
            <StatRow
              icon={Timer}
              value={counts.inProgress}
              label={t("globalInProgress")}
            />
            <StatRow
              icon={UserRound}
              value={counts.mine}
              label={t("globalAssignedToMe")}
            />
          </>
        )}
      </div>

      <Link
        href="/all"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {t("globalAllIssues")}
        <ArrowRight className="size-3.5" />
      </Link>
    </section>
  );
}
