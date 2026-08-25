"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "mangue-ui";
import { TAB_LIST_DENSE, TAB_TRIGGER_DENSE } from "@/components/tab-bar";
import { EFFORT_MAP } from "@/lib/issue-constants";
import { durationParts, fmtNum } from "@/lib/stats-derive";
import type { StatsCycleEffort } from "@/lib/types";
import { StatsSectionHeader } from "./stats-chrome";

type EffortView = "duration" | "quantity";

/** Compare median cycle time or its underlying ticket count on one shared scale. */
export function EffortDurations({
  byEffort,
}: {
  byEffort: StatsCycleEffort[];
}) {
  const t = useTranslations("Stats");
  const [view, setView] = useState<EffortView>("duration");

  return (
    <div>
      <StatsSectionHeader
        title={t("effortBreakdown")}
        info={
          view === "duration"
            ? t("effortDurationInfo")
            : t("effortQuantityInfo")
        }
      />
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as EffortView)}
        className="gap-0"
      >
        <TabsList
          variant="line"
          className={TAB_LIST_DENSE}
          aria-label={t("effortBreakdown")}
        >
          <TabsTrigger value="duration" className={TAB_TRIGGER_DENSE}>
            {t("effortDurationTab")}
          </TabsTrigger>
          <TabsTrigger value="quantity" className={TAB_TRIGGER_DENSE}>
            {t("effortQuantityTab")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="duration" className="mt-4">
          <DurationRows byEffort={byEffort} />
        </TabsContent>
        <TabsContent value="quantity" className="mt-4">
          <QuantityRows byEffort={byEffort} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DurationRows({ byEffort }: { byEffort: StatsCycleEffort[] }) {
  const t = useTranslations("Stats");
  const locale = useLocale();
  const max = byEffort.reduce((value, effort) => {
    return Math.max(value, effort.medianSeconds);
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      {byEffort.map((effort) => {
        const parts = durationParts(effort.medianSeconds);
        const duration = t(parts.key, { value: fmtNum(parts.value, locale) });
        const width = max > 0 ? (effort.medianSeconds / max) * 100 : 0;
        const label = EFFORT_MAP[effort.effort].label;
        return (
          <div key={effort.effort} className="flex items-center gap-3">
            <span className="w-7 shrink-0 text-center text-xs font-semibold text-muted-foreground">
              {label}
            </span>
            <div
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={t("effortDurationBarLabel", {
                effort: label,
                duration,
              })}
            >
              <div
                className="h-full rounded-full bg-foreground/30 transition-all"
                style={{ width: `${Math.max(width, 3)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {duration}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function QuantityRows({ byEffort }: { byEffort: StatsCycleEffort[] }) {
  const t = useTranslations("Stats");
  const max = byEffort.reduce((value, effort) => {
    return Math.max(value, effort.sample);
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      {byEffort.map((effort) => {
        const width = max > 0 ? (effort.sample / max) * 100 : 0;
        const label = EFFORT_MAP[effort.effort].label;
        return (
          <div key={effort.effort} className="flex items-center gap-3">
            <span className="w-7 shrink-0 text-center text-xs font-semibold text-muted-foreground">
              {label}
            </span>
            <div
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={t("effortQuantityBarLabel", {
                effort: label,
                count: effort.sample,
              })}
            >
              <div
                className="h-full rounded-full bg-foreground/30 transition-all"
                style={{ width: `${Math.max(width, 3)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
              {effort.sample}
            </span>
          </div>
        );
      })}
    </div>
  );
}
