"use client";

import { useTranslations } from "next-intl";
import { AppIcon } from "@/components/icon";
import { BotIcon as Bot, FolderKanbanIcon, TicketIcon as Ticket, UserGroupIcon as Users } from "@hugeicons/core-free-icons";
import { UsageBreakdownBody } from "@/components/usage-indicator";
import { useBillingSummary } from "@/lib/use-billing-query";

/**
 * Card usage of the billing page (MIN-72): the body shared with the popover of the
 * header (segmented bar + hover by type) followed by the structural limits of the
 * plan. Everything is said in percentages/quantities — never in amounts.
 */
export function UsageSection() {
  const t = useTranslations("Billing");
  const { usage } = useBillingSummary();

  if (usage && !usage.managedAi) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <UsageBreakdownBody bordered />
      {usage && (
        <div className="space-y-1.5 border-t border-border px-4 py-3 text-sm">
          <LimitRow
            icon={FolderKanbanIcon}
            label={t("limitProjects")}
            value={
              usage.limits.maxProjects == null
                ? t("unlimited")
                : `${usage.limits.projectsUsed} / ${usage.limits.maxProjects}`
            }
          />
          <LimitRow
            icon={Ticket}
            label={t("limitIssuesPerProject")}
            value={
              usage.limits.maxIssuesPerProject == null
                ? t("unlimited")
                : String(usage.limits.maxIssuesPerProject)
            }
          />
          <LimitRow
            icon={Bot}
            label={t("limitAgents")}
            value={usage.limits.allowAgents ? t("included") : t("notIncluded")}
          />
          <LimitRow
            icon={Users}
            label={t("limitMembers")}
            value={
              usage.limits.maxMembersPerProject == null
                ? t("unlimited")
                : String(usage.limits.maxMembersPerProject)
            }
          />
        </div>
      )}
    </div>
  );
}

function LimitRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FolderKanbanIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 text-foreground/80">
        <AppIcon icon={Icon} className="size-4 text-foreground/70" strokeWidth={2} />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
