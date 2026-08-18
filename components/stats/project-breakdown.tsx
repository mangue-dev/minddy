"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { StatProjectBucket } from "@/lib/types";
import { projectShare, projectsTotal } from "@/lib/stats-derive";
import { StatsCard } from "./stats-chrome";

/**
 * One line = one project. The width of the bar is compared to the BIGGEST project
 * (otherwise, with a dominant project, all the others become invisible traits
 *), while the percentage displayed can be read on the total
 * — the two readings coexist without contradicting each other.
 */
function ProjectRow({
  bucket,
  max,
  total,
  deletedLabel,
}: {
  bucket: StatProjectBucket;
  max: number;
  total: number;
  deletedLabel: string;
}) {
  const width = max > 0 ? (bucket.completed / max) * 100 : 0;
  const share = projectShare(bucket, total);
  const fill = bucket.deleted
    ? "var(--muted-foreground)"
    : (bucket.color ?? "var(--primary)");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span
          className={`truncate ${
            bucket.deleted ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {bucket.name || "—"}
          {bucket.deleted ? (
            <span className="ml-1.5 text-xs no-underline">({deletedLabel})</span>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{bucket.completed}</span>
          <span className="ml-1.5 text-xs">{share}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(width, bucket.completed > 0 ? 3 : 0)}%`,
            backgroundColor: fill,
          }}
        />
      </div>
    </div>
  );
}

/** Distribution of completed tickets by project (MIN-85). */
export function ProjectBreakdown({
  buckets,
  emptyLabel,
}: {
  buckets: StatProjectBucket[];
  emptyLabel: string;
}) {
  const t = useTranslations("Stats");

  const { max, total } = useMemo(
    () => ({
      max: buckets.reduce((m, b) => Math.max(m, b.completed), 0),
      total: projectsTotal(buckets),
    }),
    [buckets],
  );

  if (buckets.length === 0) {
    return (
      <StatsCard>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </StatsCard>
    );
  }

  return (
    <StatsCard className="flex flex-col gap-4">
      {buckets.map((bucket, i) => (
        <ProjectRow
          key={`${bucket.name ?? "?"}-${i}`}
          bucket={bucket}
          max={max}
          total={total}
          deletedLabel={t("deleted")}
        />
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">{t("perProjectTotal")}</span>
        <span className="shrink-0 font-medium tabular-nums text-foreground">
          {total}
        </span>
      </div>
    </StatsCard>
  );
}
