"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  LoaderCircleIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
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
import {
  formatBudgetPercent,
  useBillingSummary,
} from "@/lib/use-billing-query";
import { FEATURE_LABEL_KEYS } from "@/lib/usage-features";
import { SEGMENT_UI } from "@/components/billing/usage-segment-ui";
import { UsageLoadError } from "@/components/billing/usage-budget";
import { AppIcon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";

/** API side page size (get_user_usage_history / usage-history route). */
const PAGE_SIZE = 25;

/** Current-period history with cancellation-safe query keys and a mobile row layout. */
export function UsageHistorySection() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { includedUsd, usage, usageError } = useBillingSummary();

  const [open, setOpen] = useState(true);
  const [segment, setSegment] = useState<UsageSegmentId | "all">("all");
  const windowKey = `${usage?.periodStart}:${usage?.nextResetAt}`;
  const [pagination, setPagination] = useState({ windowKey, page: 0 });
  const page = pagination.windowKey === windowKey ? pagination.page : 0;
  const setPage = (value: number) => setPagination({ windowKey, page: value });
  const query = useQuery({
    queryKey: [
      "billing",
      "history",
      usage?.periodStart,
      usage?.nextResetAt,
      segment,
      page,
    ],
    queryFn: () =>
      fetchUsageHistoryApi({
        segment: segment === "all" ? null : segment,
        offset: page * PAGE_SIZE,
      }),
    enabled: open && !!usage?.managedAi,
    staleTime: 60_000,
    refetchInterval: open ? 60_000 : false,
  });
  const entries = query.data?.entries ?? [];
  const total = query.data?.total ?? 0;
  const loading = query.isPending;

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  if ((usage && !usage.managedAi) || (usageError && !usage)) return null;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border bg-card"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <HugeiconsIcon
            icon={WorkHistoryIcon}
            className="size-4 shrink-0 text-foreground/70"
            strokeWidth={2}
          />
          <span className="text-sm font-semibold">{t("historyTitle")}</span>
          <span className="w-full text-xs text-muted-foreground sm:w-auto">
            {t("historySubtitle")}
          </span>
        </div>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
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
              <SelectTrigger
                size="sm"
                className="w-full sm:w-60"
                aria-label={t("historyAllTypes")}
              >
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

          {query.isError && query.data && (
            <p role="status" className="px-4 pb-3 text-xs text-destructive">
              {t("usageRefreshFailed")}
            </p>
          )}

          {query.isError && !query.data ? (
            <UsageLoadError onRetry={() => void query.refetch()} />
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-8 text-sm text-muted-foreground">
              <HugeiconsIcon
                icon={LoaderCircleIcon}
                className="size-4 animate-spin"
              />
            </div>
          ) : total === 0 ? (
            <div className="border-t border-border p-4">
              <EmptyState
                icon={
                  <HugeiconsIcon icon={WorkHistoryIcon} className="size-6" />
                }
                description={t("historyEmpty")}
              />
            </div>
          ) : (
            <>
              <ul
                className={cn(
                  "divide-y divide-border border-t border-border",
                  loading && "opacity-60",
                )}
              >
                {entries.map((entry) => {
                  const ui = SEGMENT_UI[entry.segmentId];
                  const Icon = ui.icon;
                  return (
                    <li
                      key={entry.runId}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <AppIcon
                          icon={Icon}
                          className={cn("size-4 shrink-0", ui.text)}
                          strokeWidth={2}
                        />
                        <span className="min-w-0 break-words text-sm text-foreground">
                          {/* Name the specific action; the icon identifies its usage segment. */}
                          {t(
                            entry.feature
                              ? FEATURE_LABEL_KEYS[entry.feature]
                              : ui.labelKey,
                          )}
                        </span>
                        {entry.projectName && (
                          <span className="w-full break-words pl-6 text-xs text-muted-foreground sm:w-auto sm:pl-0">
                            {entry.projectName}
                          </span>
                        )}
                      </div>
                      <span className="col-start-1 row-start-2 pl-6 text-xs tabular-nums text-muted-foreground sm:col-start-2 sm:row-start-1 sm:pl-0">
                        {dateFormat.format(new Date(entry.at))}
                      </span>
                      <span className="col-start-2 row-start-1 text-right text-sm font-medium tabular-nums sm:col-start-3">
                        {formatBudgetPercent(entry.usd, includedUsd, locale)}
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
                      onClick={() => setPage(Math.max(0, page - 1))}
                    >
                      <HugeiconsIcon
                        icon={ArrowLeft01Icon}
                        className="size-4"
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("historyNext")}
                      disabled={loading || page >= pages - 1}
                      onClick={() => setPage(Math.min(pages - 1, page + 1))}
                    >
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="size-4"
                      />
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
