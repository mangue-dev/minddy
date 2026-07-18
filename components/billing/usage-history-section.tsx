"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { History, Loader2 } from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "mangue-ui";
import { USAGE_SEGMENTS, type UsageSegmentId } from "@/lib/billing-plans";
import { fetchUsageHistoryApi } from "@/lib/billing-api";
import { formatBudgetPercent, useBillingSummary } from "@/lib/use-billing-query";
import { SEGMENT_UI } from "@/components/usage-indicator";
import { EmptyState } from "@/components/empty-state";
import type { UsageHistoryEntry } from "@/lib/billing-types";

/**
 * Historique d'usage typé de la page billing (MIN-72, retours — façon AutoKap) :
 * une ligne par run du ledger (date, type avec l'icône/couleur des segments,
 * projet, part du budget en %), filtre par type, pagination « Charger plus ».
 */
export function UsageHistorySection() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { includedUsd } = useBillingSummary();

  const [segment, setSegment] = useState<UsageSegmentId | "all">("all");
  const [entries, setEntries] = useState<UsageHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (target: UsageSegmentId | "all", offset: number) => {
      setLoading(true);
      try {
        const page = await fetchUsageHistoryApi({
          segment: target === "all" ? null : target,
          offset,
        });
        setTotal(page.total);
        setEntries((prev) =>
          offset === 0 ? page.entries : [...prev, ...page.entries]
        );
      } catch (err) {
        console.error("[usage-history] load failed:", (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(segment, 0);
  }, [segment, load]);

  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Select
          value={segment}
          onValueChange={(value) => setSegment(value as UsageSegmentId | "all")}
        >
          <SelectTrigger size="sm" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">{t("historyAllTypes")}</SelectItem>
            {USAGE_SEGMENTS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {t(SEGMENT_UI[s.id].labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {entries.length === 0 && !loading ? (
        <EmptyState
          icon={<History className="size-6" />}
          description={t("historyEmpty")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const ui = SEGMENT_UI[entry.segmentId];
              const Icon = ui.icon;
              return (
                <li
                  key={entry.runId}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Icon
                      className={cn("size-4 shrink-0", ui.text)}
                      strokeWidth={2}
                    />
                    <span className="truncate text-sm text-foreground">
                      {t(ui.labelKey)}
                    </span>
                    {entry.projectName && (
                      <span className="truncate text-xs text-muted-foreground">
                        {entry.projectName}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {dateFormat.format(new Date(entry.at))}
                  </span>
                  <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums">
                    {formatBudgetPercent(entry.usd, includedUsd)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {entries.length < total && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => void load(segment, entries.length)}
            className="gap-1.5 text-muted-foreground"
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            {t("historyLoadMore", { remaining: total - entries.length })}
          </Button>
        </div>
      )}
    </div>
  );
}
