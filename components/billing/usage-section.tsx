"use client";

import { useTranslations } from "next-intl";
import { Bot, FolderKanban, Ticket, Users } from "lucide-react";
import { UsageBreakdownBody } from "@/components/usage-indicator";
import { useBillingSummary } from "@/lib/use-billing-query";

/**
 * Carte usage de la page billing (MIN-72) : le corps partagé avec le popover du
 * header (barre segmentée + hover par type) suivi des limites structurelles du
 * plan. Tout se dit en pourcentages/quantités — jamais en montants.
 */
export function UsageSection() {
  const t = useTranslations("Billing");
  const { usage } = useBillingSummary();

  return (
    <div className="rounded-xl border border-border bg-card">
      <UsageBreakdownBody bordered />
      {usage && (
        <div className="space-y-1.5 border-t border-border px-4 py-3 text-sm">
          <LimitRow
            icon={FolderKanban}
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
  icon: typeof FolderKanban;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 text-foreground/80">
        <Icon className="size-4 text-foreground/70" strokeWidth={2} />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
