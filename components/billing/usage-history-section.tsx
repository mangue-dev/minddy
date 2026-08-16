"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronLeft, ChevronRight, History, Loader2 } from "lucide-react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
import { FEATURE_LABEL_KEYS } from "@/lib/usage-features";
import { SEGMENT_UI } from "@/components/usage-indicator";
import { EmptyState } from "@/components/empty-state";
import type { UsageHistoryEntry } from "@/lib/billing-types";

/** Taille de page côté API (get_user_usage_history / route usage-history). */
const PAGE_SIZE = 25;

/**
 * Historique d'usage typé de la page billing (MIN-72, retours — façon AutoKap) :
 * un ACCORDÉON replié par défaut ; ouvert, une ligne par run du ledger (date,
 * type avec l'icône/couleur des segments, projet, part du budget en %), filtre
 * par type et pagination Précédent/Suivant (25 par page). Chargement paresseux
 * à la première ouverture.
 */
export function UsageHistorySection() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { includedUsd, usage } = useBillingSummary();

  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState<UsageSegmentId | "all">("all");
  const [page, setPage] = useState(0);
  const [entries, setEntries] = useState<UsageHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(
    async (target: UsageSegmentId | "all", targetPage: number) => {
      setLoading(true);
      try {
        const result = await fetchUsageHistoryApi({
          segment: target === "all" ? null : target,
          offset: targetPage * PAGE_SIZE,
        });
        setTotal(result.total);
        setEntries(result.entries);
        setLoadedOnce(true);
      } catch (err) {
        console.error("[usage-history] load failed:", (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    void load(segment, page);
  }, [open, segment, page, load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (usage && !usage.managedAi) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border bg-card"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex min-w-0 items-center gap-2.5">
          <History className="size-4 shrink-0 text-foreground/70" strokeWidth={2} />
          <span className="text-sm font-semibold">{t("historyTitle")}</span>
          <span className="truncate text-xs text-muted-foreground">
            {t("historySubtitle")}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border">
          <div className="flex justify-end px-4 py-3">
            <Select
              value={segment}
              onValueChange={(value) => {
                setSegment(value as UsageSegmentId | "all");
                setPage(0);
              }}
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

          {!loadedOnce || (loading && entries.length === 0) ? (
            <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : total === 0 ? (
            <div className="border-t border-border p-4">
              <EmptyState
                icon={<History className="size-6" />}
                description={t("historyEmpty")}
              />
            </div>
          ) : (
            <>
              <ul
                className={cn(
                  "divide-y divide-border border-t border-border",
                  loading && "opacity-60"
                )}
              >
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
                          {/* Le geste, pas la famille : « Smart-fill », pas
                              « Automatisations ». La famille reste lisible —
                              c'est l'icône et sa couleur. */}
                          {t(entry.feature ? FEATURE_LABEL_KEYS[entry.feature] : ui.labelKey)}
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
              {pages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("historyPageOf", { page: page + 1, pages })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("historyPrev")}
                      disabled={loading || page === 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("historyNext")}
                      disabled={loading || page >= pages - 1}
                      onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
