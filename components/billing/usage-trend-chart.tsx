"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from "mangue-ui";
import {
  useBillingSummary,
  useBillingUsageAnalytics,
  formatBudgetPercent,
} from "@/lib/use-billing-query";
import { USAGE_SEGMENTS } from "@/lib/billing-plans";
import { SEGMENT_UI } from "@/components/billing/usage-segment-ui";
import {
  SEGMENT_CHART_UI,
  UsageLoadError,
} from "@/components/billing/usage-budget";

const DAY_MS = 86_400_000;

/** SVG marks follow the application theme; date selection also works by keyboard. */
export function UsageTrendChart() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { usage } = useBillingSummary();
  const query = useBillingUsageAnalytics(usage);
  const [mode, setMode] = useState<"cumulative" | "daily">("cumulative");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const clipId = useId();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const data = query.data;
  const days = data?.days ?? [];
  const matchedIndex = days.findIndex((day) => day.day === selectedDay);
  const selectedIndex = matchedIndex >= 0 ? matchedIndex : days.length - 1;
  const selected = days[selectedIndex];
  const budget = data?.includedUsd ?? 0;
  const percent = (usd: number) => (budget > 0 ? (usd / budget) * 100 : 0);
  const display = (usd: number) =>
    usd === 0 ? "0%" : formatBudgetPercent(usd, budget, locale);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const dateLabel = (at: number | string) => dateFormat.format(new Date(at));
  const start = data ? Date.parse(data.periodStart) : 0;
  const end = data ? Date.parse(data.periodEnd) : 1;
  const observed = data ? Math.min(Date.parse(data.observedAt), end) : 0;
  let sum = 0;
  const points = days.map((day) => {
    sum += day.usd;
    return {
      at: Math.min(Date.parse(`${day.day}T00:00:00Z`) + DAY_MS, observed),
      usd: sum,
    };
  });
  const dailyMax = Math.max(0.1, ...days.map((day) => percent(day.usd)));
  const magnitude = 10 ** Math.floor(Math.log10(dailyMax));
  const max =
    mode === "cumulative"
      ? Math.max(100, Math.ceil(percent(sum) / 20) * 20)
      : Math.ceil(dailyMax / magnitude) * magnitude;
  const height = 220,
    left = 44,
    right = 10,
    top = 26,
    bottom = 30;
  const plotWidth = Math.max(0, width - left - right);
  const baseline = height - bottom;
  const x = (at: number) =>
    left + ((at - start) / Math.max(1, end - start)) * plotWidth;
  const y = (value: number) => baseline - (value / max) * (baseline - top);
  const line = [
    `M${left},${baseline}`,
    ...points.map((point) => `L${x(point.at)},${y(percent(point.usd))}`),
  ].join(" ");
  const selectedAt = selected
    ? mode === "daily"
      ? (Math.max(start, Date.parse(`${selected.day}T00:00:00Z`)) +
          points[selectedIndex].at) /
        2
      : points[selectedIndex].at
    : start;
  const axisNumber = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  });
  const chooseAt = (clientX: number) => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect || !points.length) return;
    const at =
      start +
      Math.max(
        0,
        Math.min(1, (clientX - rect.left - left) / Math.max(1, plotWidth)),
      ) *
        (end - start);
    const selectionTimes = points.map((point, i) =>
      mode === "daily"
        ? (Math.max(start, Date.parse(`${days[i].day}T00:00:00Z`)) + point.at) /
          2
        : point.at,
    );
    const nearest = selectionTimes.reduce(
      (best, time, i) =>
        Math.abs(time - at) < Math.abs(selectionTimes[best] - at) ? i : best,
      0,
    );
    setSelectedDay(days[nearest].day);
  };

  return (
    <Card size="sm" className="min-w-0">
      <CardHeader className="gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("trendTitle")}</h2>
          <CardDescription className="mt-1 text-xs">
            {t(
              mode === "cumulative" ? "trendCumulativeHint" : "trendDailyHint",
            )}
          </CardDescription>
        </div>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label={t("trendViewLabel")}
        >
          <Button
            size="sm"
            variant={mode === "cumulative" ? "outline" : "ghost"}
            aria-pressed={mode === "cumulative"}
            onClick={() => setMode("cumulative")}
          >
            {t("trendCumulative")}
          </Button>
          <Button
            size="sm"
            variant={mode === "daily" ? "outline" : "ghost"}
            aria-pressed={mode === "daily"}
            onClick={() => setMode("daily")}
          >
            {t("trendDaily")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={container} className="min-w-0">
          {query.isError && !data ? (
            <UsageLoadError onRetry={() => void query.refetch()} />
          ) : query.isPending || !width ? (
            <Skeleton className="h-[220px] w-full" />
          ) : !days.length ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              {t("historyEmpty")}
            </p>
          ) : (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              width="100%"
              height={height}
              role="img"
              aria-label={t(
                mode === "cumulative"
                  ? "trendCumulativeSummary"
                  : "trendDailySummary",
                { percent: display(sum) },
              )}
              className="touch-pan-y"
              onPointerMove={(event) => {
                if (event.pointerType === "mouse") chooseAt(event.clientX);
              }}
              onPointerDown={(event) => chooseAt(event.clientX)}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x={left}
                    y={top}
                    width={plotWidth}
                    height={baseline - top}
                  />
                </clipPath>
              </defs>
              {[0, max / 2, max].map((value) => (
                <g key={value}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(value)}
                    y2={y(value)}
                    className="stroke-border"
                  />
                  <text
                    x={left - 7}
                    y={y(value) + 4}
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {axisNumber.format(value)}%
                  </text>
                </g>
              ))}
              {[start, start + (end - start) / 2, end].map((at, i) => (
                <text
                  key={at}
                  x={x(at)}
                  y={height - 7}
                  textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                  className="fill-muted-foreground text-[11px]"
                >
                  {dateLabel(at)}
                </text>
              ))}
              {mode === "cumulative" && (
                <>
                  <text
                    x={width - right}
                    y={15}
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {t("budgetIncluded")}
                  </text>
                  {max > 100 && (
                    <line
                      x1={left}
                      x2={width - right}
                      y1={y(100)}
                      y2={y(100)}
                      className="stroke-muted-foreground"
                      strokeDasharray="4 4"
                    />
                  )}
                </>
              )}
              <g clipPath={`url(#${clipId})`}>
                {mode === "cumulative" ? (
                  <>
                    <path
                      d={`${line} L${x(points.at(-1)!.at)},${baseline} Z`}
                      className="fill-primary/5"
                    />
                    <path
                      d={line}
                      className="fill-none stroke-primary"
                      strokeWidth={2}
                    />
                  </>
                ) : (
                  days.map((day) => {
                    const from = Math.max(
                      start,
                      Date.parse(`${day.day}T00:00:00Z`),
                    );
                    const until = Math.min(
                      observed,
                      Date.parse(`${day.day}T00:00:00Z`) + DAY_MS,
                    );
                    let offset = 0;
                    return (
                      <g key={day.day}>
                        {USAGE_SEGMENTS.map((segment) => {
                          const value = percent(
                            day.segments.find((s) => s.id === segment.id)
                              ?.usd ?? 0,
                          );
                          offset += value;
                          return (
                            <rect
                              key={segment.id}
                              x={x(from) + 1}
                              y={y(offset)}
                              width={Math.max(1, x(until) - x(from) - 2)}
                              height={(value / max) * (baseline - top)}
                              className={SEGMENT_CHART_UI[segment.id].fill}
                            />
                          );
                        })}
                      </g>
                    );
                  })
                )}
              </g>
              {selected && (
                <>
                  <line
                    x1={x(selectedAt)}
                    x2={x(selectedAt)}
                    y1={top}
                    y2={baseline}
                    className="stroke-muted-foreground/50"
                    strokeDasharray="3 4"
                  />
                  {mode === "cumulative" && (
                    <circle
                      cx={x(points[selectedIndex].at)}
                      cy={y(percent(points[selectedIndex].usd))}
                      r={3.5}
                      className="fill-primary"
                    />
                  )}
                </>
              )}
            </svg>
          )}
        </div>
        {selected && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Select value={selected.day} onValueChange={setSelectedDay}>
                <SelectTrigger
                  size="sm"
                  className="w-auto min-w-28"
                  aria-label={t("trendInspectDay")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {days.map((day) => (
                    <SelectItem key={day.day} value={day.day}>
                      {dateLabel(`${day.day}T00:00:00Z`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                className="text-xs tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                {t(
                  mode === "cumulative"
                    ? "trendCumulativeDetail"
                    : "trendDailyDetail",
                  {
                    percent: display(
                      mode === "cumulative"
                        ? points[selectedIndex].usd
                        : selected.usd,
                    ),
                  },
                )}
              </p>
            </div>
            {mode === "daily" && (
              <ul className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {USAGE_SEGMENTS.map((segment) => (
                  <li
                    key={segment.id}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="flex items-start gap-1.5">
                      <span
                        className={cn(
                          "mt-1 size-1.5 shrink-0 rounded-full",
                          segment.barClass,
                        )}
                      />
                      {t(SEGMENT_UI[segment.id].labelKey)}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {display(
                        selected.segments.find((s) => s.id === segment.id)
                          ?.usd ?? 0,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {query.isError && data && (
          <p role="status" className="text-xs text-destructive">
            {t("usageRefreshFailed")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("trendUtcHint")}</p>
      </CardContent>
    </Card>
  );
}
