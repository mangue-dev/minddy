"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, CalendarClock, CircleDashed } from "lucide-react";
import { Skeleton } from "mangue-ui";
import { useGlobalBoardQuery } from "@/lib/use-global-board-query";
import { useProjects } from "@/lib/projects-context";
import {
  cycleCompletionPercent,
  cycleFilledPoints,
  recoComparator,
} from "@/lib/cycle";
import { CycleControls, formatCycleRange } from "@/components/cycle/cycle-header";
import { StatusIndicator } from "@/components/issue-indicators";
import { issueIdentifier } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

/** Shared card chrome — heading + right slot, growing body, bottom footer. */
function Shell({
  title,
  right,
  footer,
  children,
}: {
  title: ReactNode;
  right?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{title}</div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
      {footer}
    </section>
  );
}

function FooterLink({ label }: { label: string }) {
  // The cycle lives on /all in cycle mode (MIN-32), never scoped to a project.
  return (
    <Link
      href="/all?view=cycle"
      className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

/** One reco-ordered ticket of the cycle: status dot + identifier + title,
    deep-linking to the issue in its own project board (?issue=<id>). */
function CycleIssueRow({
  issue,
  projectKey,
}: {
  issue: Issue;
  projectKey: string;
}) {
  return (
    <Link
      href={`/projects/${issue.project_id}?issue=${issue.id}`}
      className="group flex items-center gap-2 rounded-md py-0.5 text-sm"
    >
      <StatusIndicator status={issue.status} className="size-4" />
      {projectKey ? (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {issueIdentifier(projectKey, issue.number)}
        </span>
      ) : null}
      <span className="truncate text-foreground/90 group-hover:text-foreground">
        {issue.title}
      </span>
    </Link>
  );
}

export function HomeCycleCard() {
  const t = useTranslations("Home");
  const format = useFormatter();
  const { issues, relations, cycles, loading } = useGlobalBoardQuery();
  const { projects } = useProjects();

  const current = cycles?.current ?? null;

  const cycleIssues = useMemo(
    () => (current ? issues.filter((i) => i.cycle_id === current.id) : []),
    [issues, current],
  );

  const topIssues = useMemo(() => {
    if (!current) return [] as Issue[];
    // Blockers may sit outside the cycle → the status map spans the whole board.
    const statusById = new Map(issues.map((i) => [i.id, i.status]));
    return [...cycleIssues].sort(recoComparator(relations, statusById)).slice(0, 3);
  }, [cycleIssues, issues, relations, current]);

  const projectKeyById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.key])),
    [projects],
  );

  const heading = (
    <h2 className="text-sm font-semibold tracking-tight">{t("cycleTitle")}</h2>
  );

  if (loading) {
    return (
      <Shell title={heading}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-4 w-44" />
      </Shell>
    );
  }

  // Cycles never activated → invite to turn them on (activation lives on /all).
  if (!cycles?.enabled) {
    return (
      <Shell title={heading} footer={<FooterLink label={t("cycleActivate")} />}>
        <p className="text-sm text-muted-foreground">{t("cycleActivatePrompt")}</p>
      </Shell>
    );
  }

  // Enabled but between cycles → point at the next window's start date.
  if (!current) {
    const next = cycles.upcoming[0] ?? null;
    return (
      <Shell title={heading} footer={<FooterLink label={t("openCycle")} />}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" />
          {next
            ? t("cycleNextStart", { date: formatCycleRange(format, next) })
            : t("cycleActivatePrompt")}
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title={
        <>
          {heading}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatCycleRange(format, current)}
          </p>
        </>
      }
      right={
        <CycleControls
          cycle={current}
          filledPoints={cycleFilledPoints(cycleIssues)}
          completionPercent={cycleCompletionPercent(cycleIssues)}
        />
      }
      footer={<FooterLink label={t("openCycle")} />}
    >
      {topIssues.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {topIssues.map((issue) => (
            <li key={issue.id} className="min-w-0">
              <CycleIssueRow
                issue={issue}
                projectKey={projectKeyById.get(issue.project_id) ?? ""}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleDashed className="size-4 shrink-0" />
          {t("cycleEmpty")}
        </div>
      )}
    </Shell>
  );
}
