"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader } from "mangue-ui";
import { AppIcon } from "@/components/icon";
import {
  BotIcon,
  FolderKanbanIcon,
  TicketIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import {
  UsageBudgetSummary,
  UsageSegmentBreakdown,
} from "@/components/billing/usage-budget";
import { UsageTrendChart } from "@/components/billing/usage-trend-chart";
import { useBillingSummary } from "@/lib/use-billing-query";

export function UsageSection() {
  const t = useTranslations("Billing");
  const { usage, usageError } = useBillingSummary();
  if (usage && !usage.managedAi) return null;
  return (
    <div className="min-w-0 space-y-5">
      <Card className="gap-0 py-0">
        <UsageBudgetSummary />
      </Card>
      {!(usageError && !usage) && (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <UsageTrendChart />
          <Card size="sm" className="min-w-0">
            <CardHeader>
              <h2 className="text-sm font-semibold">{t("segmentTitle")}</h2>
              <CardDescription className="text-xs">
                {t("segmentBudgetHint")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsageSegmentBreakdown />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Structural limits are kept near the subscription, outside AI consumption charts. */
export function BillingLimits() {
  const t = useTranslations("Billing");
  const { usage } = useBillingSummary();
  if (!usage || !usage.managedBilling) return null;
  const limits = usage.limits;
  const rows = [
    {
      icon: FolderKanbanIcon,
      label: t("limitProjects"),
      value:
        limits.maxProjects == null
          ? t("unlimited")
          : `${limits.projectsUsed} / ${limits.maxProjects}`,
    },
    {
      icon: TicketIcon,
      label: t("limitIssuesPerProject"),
      value:
        limits.maxIssuesPerProject == null
          ? t("unlimited")
          : String(limits.maxIssuesPerProject),
    },
    {
      icon: BotIcon,
      label: t("limitAgents"),
      value: limits.allowAgents ? t("included") : t("notIncluded"),
    },
    {
      icon: UserGroupIcon,
      label: t("limitMembers"),
      value:
        limits.maxMembersPerProject == null
          ? t("unlimited")
          : String(limits.maxMembersPerProject),
    },
  ];
  return (
    <ul className="grid gap-3 text-sm sm:grid-cols-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 items-start gap-2 text-muted-foreground">
            <AppIcon
              icon={row.icon}
              className="mt-0.5 size-4 shrink-0"
              strokeWidth={2}
            />
            {row.label}
          </span>
          <span className="shrink-0 font-medium tabular-nums">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}
