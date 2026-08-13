"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  Skeleton,
  cn,
} from "mangue-ui";
import {
  Metric,
  StatsCard,
  StatsSection,
  StatsSectionHeader,
  TotalItem,
} from "@/components/stats/stats-chrome";
import type { AdminOverview, AdminOverviewDay } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * `/admin` → onglet « Vue d'ensemble » (MIN-90) : l'app vue d'en haut —
 * combien de comptes, combien vivent, où ils en sont.
 *
 * L'écran reprend délibérément le chrome de `/statistics` (`stats-chrome`) :
 * même carte, même hiérarchie titre-hors-carte, même poids de chiffre. Un admin
 * n'a pas à apprendre une deuxième grammaire visuelle pour lire des compteurs.
 *
 * Deux séries se lisent ici — actifs par jour et inscriptions par jour. Elles ne
 * partagent PAS un graphique : deux bandes jumelles, chacune avec sa propre
 * échelle et son titre. Superposer deux mesures d'amplitudes différentes sur un
 * même axe écraserait la plus petite (les inscriptions) jusqu'à l'invisible.
 */

/** Une bande de 30 jours, une barre par jour, une seule mesure. */
function DayStrip({
  days,
  label,
  pick,
  emptyLabel,
}: {
  days: AdminOverviewDay[];
  label: string;
  pick: (day: AdminOverviewDay) => number;
  emptyLabel: string;
}) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const max = useMemo(
    () => days.reduce((m, d) => Math.max(m, pick(d)), 0),
    [days, pick],
  );

  const dayLabel = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  if (days.length === 0 || max === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-16 items-end gap-[2px]">
        {days.map((day) => {
          const value = pick(day);
          // Une journée à 1 doit rester visible à côté d'une journée à 30 :
          // plancher de hauteur pour toute valeur non nulle.
          const height = value === 0 ? 0 : Math.max((value / max) * 100, 8);
          return (
            // La cible de survol est la COLONNE entière, pas la barre : viser
            // 2 px de haut un jour à zéro serait impossible.
            <Tooltip key={day.day}>
              <TooltipTrigger asChild>
                <div className="flex h-full flex-1 items-end">
                  {/* Barre ancrée à la ligne de base : seul le haut est arrondi —
                      un bas arrondi ferait flotter la barre au-dessus de zéro. */}
                  <div
                    className={cn(
                      "w-full rounded-t-[3px] transition-[height]",
                      value === 0 ? "h-px bg-border" : "bg-foreground/70",
                    )}
                    style={value === 0 ? undefined : { height: `${height}%` }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{dayLabel(day.day)}</span>
                <span className="block text-background/70">
                  {t("overview.tooltipValue", { label, value })}
                </span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{dayLabel(days[0].day)}</span>
        <span>{dayLabel(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

/** Répartition par plan : une ligne, une barre, la part en pourcentage. */
function PlanRow({
  planId,
  count,
  max,
  total,
}: {
  planId: string;
  count: number;
  max: number;
  total: number;
}) {
  const width = max > 0 ? (count / max) * 100 : 0;
  const share = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{planId}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          <span className="font-medium text-foreground">{count}</span>
          <span className="ml-1.5 text-xs">{share}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/70 transition-all"
          style={{ width: `${Math.max(width, count > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function AdminOverviewDashboard() {
  const t = useTranslations("Admin");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Les journées sont découpées dans le fuseau de l'admin qui regarde :
      // « actifs aujourd'hui » doit vouloir dire aujourd'hui, chez lui.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(
        `/api/admin/overview?tz=${encodeURIComponent(tz || "UTC")}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as AdminOverview);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pickActive = useCallback((day: AdminOverviewDay) => day.active, []);
  const pickSignups = useCallback((day: AdminOverviewDay) => day.signups, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (error || !data) {
    return <p className="text-sm text-destructive">{error ?? "—"}</p>;
  }

  const maxPlan = data.plans.reduce((m, p) => Math.max(m, p.count), 0);
  const notStarted = Math.max(data.totalUsers - data.onboarding.started, 0);

  return (
    <div>
      {/* 1 — Le présent : combien de comptes, combien vivent. */}
      <StatsCard className="grid grid-cols-1 gap-5 divide-y divide-border sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-y-0">
        <Metric
          variant="hero"
          className="sm:pr-5"
          label={t("overview.totalUsers")}
          value={data.totalUsers}
          // Un total qui baisse parce qu'on a marqué un compte interne doit
          // s'expliquer sur place, sinon le chiffre devient suspect.
          hint={
            <>
              {t("overview.newUsers", { count: data.newUsers7d })}
              {data.internalUsers > 0 ? (
                <span className="block">
                  {t("overview.internalExcluded", { count: data.internalUsers })}
                </span>
              ) : null}
            </>
          }
          info={data.internalUsers > 0 ? t("overview.internalInfo") : undefined}
        />
        <Metric
          variant="hero"
          className="pt-5 sm:px-5 sm:pt-0"
          label={t("overview.activeWeek")}
          value={data.active7d}
          hint={t("overview.activeMonth", { count: data.active30d })}
          info={t("overview.activeInfo")}
        />
        <Metric
          variant="hero"
          className="pt-5 sm:pl-5 sm:pt-0"
          label={t("overview.activeToday")}
          value={data.activeToday}
          hint={t("overview.signupsToday", {
            count: data.days.at(-1)?.signups ?? 0,
          })}
        />
      </StatsCard>

      {/* 2 — Les 30 derniers jours, deux bandes jumelles (jamais superposées). */}
      <StatsSection title={t("overview.activity")} info={t("overview.activeInfo")}>
        <StatsCard className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <StatsSectionHeader title={t("overview.activeDaily")} />
            <DayStrip
              days={data.days}
              label={t("overview.activeDaily")}
              pick={pickActive}
              emptyLabel={t("overview.noActivity")}
            />
          </div>
          <div className="flex flex-col gap-3">
            <StatsSectionHeader title={t("overview.signupsDaily")} />
            <DayStrip
              days={data.days}
              label={t("overview.signupsDaily")}
              pick={pickSignups}
              emptyLabel={t("overview.noSignups")}
            />
          </div>
        </StatsCard>
      </StatsSection>

      {/* 3 — Où en sont les nouveaux venus. */}
      <StatsSection
        title={t("overview.onboarding")}
        info={t("overview.onboardingInfo")}
      >
        <StatsCard className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <TotalItem
            label={t("overview.onboardingStarted")}
            value={data.onboarding.started}
          />
          <TotalItem
            label={t("overview.onboardingCompleted")}
            value={data.onboarding.completed}
          />
          <TotalItem
            label={t("overview.onboardingDismissed")}
            value={data.onboarding.dismissed}
          />
          <TotalItem
            label={t("overview.onboardingNeverSeen")}
            value={notStarted}
          />
        </StatsCard>
      </StatsSection>

      {/* 4 — Ce qu'ils paient. */}
      <StatsSection title={t("overview.plans")} info={t("overview.plansInfo")}>
        <StatsCard className="flex flex-col gap-4">
          {data.plans.map((plan) => (
            <PlanRow
              key={plan.planId}
              planId={plan.planId}
              count={plan.count}
              max={maxPlan}
              total={data.totalUsers}
            />
          ))}
        </StatsCard>
      </StatsSection>

      {/* 5 — Le socle : ce que l'app contient. */}
      <StatsSection title={t("overview.content")}>
        <StatsCard className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <TotalItem
            label={t("overview.totalProjects")}
            value={data.totalProjects}
          />
          <TotalItem label={t("overview.totalIssues")} value={data.totalIssues} />
          <TotalItem
            label={t("overview.newUsers30d")}
            value={data.newUsers30d}
          />
          <TotalItem
            label={t("overview.issuesPerProject")}
            value={
              data.totalProjects > 0
                ? Math.round((data.totalIssues / data.totalProjects) * 10) / 10
                : 0
            }
          />
        </StatsCard>
      </StatsSection>
    </div>
  );
}
