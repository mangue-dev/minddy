"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useBillingSummary,
  useBillingUsageAnalytics,
  formatBudgetPercent,
} from "@/lib/use-billing-query";
import { USAGE_SEGMENTS } from "@/lib/billing-plans";
import { forecastUsage, type UsageForecast } from "@/lib/usage-forecast";
import { SEGMENT_UI } from "@/components/billing/usage-segment-ui";
import { UsageLoadError } from "@/components/billing/usage-budget";
import { StackedBarChart } from "@/components/admin/cost-charts";

const DAY_MS = 86_400_000;
const HEIGHT = 220;

/**
 * A forecast reads as an estimate: whole percents, one decimal below 10 %,
 * and "<0.1 %" rather than a misleading 0 % for a light but real usage.
 */
function formatForecastPercent(percent: number, locale: string): string {
  const format = (digits: number, value: number) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: digits,
    }).format(value / 100);
  if (percent <= 0) return format(0, 0);
  if (percent < 0.1) return `<${format(1, 0.1)}`;
  return percent < 10 ? format(1, percent) : format(0, Math.round(percent));
}

/** The sentence under the budget chart's title: where the period is heading. */
function ForecastSentence({ forecast }: { forecast: UsageForecast | null }) {
  const t = useTranslations("Billing");
  const locale = useLocale();
  if (!forecast) return null;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(
      new Date(iso),
    );
  const percent = formatForecastPercent(forecast.projectedPercent, locale);
  const { status } = forecast;
  return (
    <CardDescription
      data-testid="usage-forecast"
      data-status={status}
      className={cn(
        "mt-1 text-xs",
        status === "short" || status === "exhausted"
          ? "text-destructive"
          : status === "tight"
            ? "text-warning-strong"
            : undefined,
      )}
    >
      {status === "too_early"
        ? t("forecastTooEarly")
        : status === "exhausted"
          ? t("forecastExhausted", { date: date(forecast.resetsAt) })
          : status === "short"
            ? t("forecastShort", {
                date: date(forecast.runsOutAt!),
                days: forecast.daysShort,
              })
            : t(status === "tight" ? "forecastTight" : "forecastOnTrack", {
                percent,
              })}
    </CardDescription>
  );
}

interface ChartStop {
  at: number;
  percent: number;
  /** The day the value closes, shown in the hover card. */
  label: string;
  forecast: boolean;
}

/**
 * Cumulative consumption of the period, solid, then the forecast to the
 * reset, dashed (MIN-946). Hovering the chart shows a card on it with the
 * day and the value, the way the admin charts do.
 */
export function BudgetTrendChart() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { usage } = useBillingSummary();
  const query = useBillingUsageAnalytics(usage);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
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
  const forecast = useMemo(
    () =>
      data
        ? forecastUsage({
            days: data.days,
            includedUsd: data.includedUsd,
            periodStart: data.periodStart,
            periodEnd: data.periodEnd,
            observedAt: data.observedAt,
          })
        : null,
    [data],
  );
  const days = data?.days ?? [];
  const budget = data?.includedUsd ?? 0;
  const percentOf = (usd: number) => (budget > 0 ? (usd / budget) * 100 : 0);
  const dayFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const start = data ? Date.parse(data.periodStart) : 0;
  const end = data ? Date.parse(data.periodEnd) : 1;
  const observed = data ? Math.min(Date.parse(data.observedAt), end) : 0;

  let sum = 0;
  const actual: ChartStop[] = days.map((day) => {
    sum += day.usd;
    const dayStart = Date.parse(`${day.day}T00:00:00Z`);
    return {
      at: Math.min(dayStart + DAY_MS, observed),
      percent: percentOf(sum),
      label: dayFormat.format(dayStart),
      forecast: false,
    };
  });
  // The first forecast point is the last observation: the card shows it once.
  const projected: ChartStop[] = (forecast?.points ?? [])
    .slice(1)
    .map((point) => ({
      at: point.at,
      percent: point.percent,
      label: dayFormat.format(point.at - 1),
      forecast: true,
    }));
  const stops = [...actual, ...projected];

  const usedPercent = percentOf(sum);
  const peak = Math.max(usedPercent, forecast?.projectedPercent ?? 0);
  // A runaway forecast keeps the observed part readable: the dashed line
  // leaves the frame instead of flattening everything below it.
  const max = Math.max(
    100,
    Math.ceil(Math.min(peak, Math.max(usedPercent, 200)) / 20) * 20,
  );
  const left = 44,
    right = 10,
    top = 26,
    bottom = 30;
  const plotWidth = Math.max(0, width - left - right);
  const baseline = HEIGHT - bottom;
  const x = (at: number) =>
    left + ((at - start) / Math.max(1, end - start)) * plotWidth;
  const y = (value: number) => baseline - (value / max) * (baseline - top);
  const path = (points: ReadonlyArray<{ at: number; percent: number }>) =>
    points
      .map(
        (point, i) => `${i === 0 ? "M" : "L"}${x(point.at)},${y(point.percent)}`,
      )
      .join(" ");
  const actualLine = path([{ at: start, percent: 0 }, ...actual]);
  const forecastLine = forecast?.points.length ? path(forecast.points) : null;
  const axisNumber = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  });
  const display = (value: number) =>
    value === 0 ? "0%" : formatBudgetPercent((value / 100) * budget, budget, locale);
  const forecastDisplay = (value: number) =>
    formatForecastPercent(value, locale);

  const hoverAt = (clientX: number) => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect || !stops.length) return;
    const at =
      start +
      Math.max(
        0,
        Math.min(1, (clientX - rect.left - left) / Math.max(1, plotWidth)),
      ) *
        (end - start);
    setHovered(
      stops.reduce(
        (best, stop, i) =>
          Math.abs(stop.at - at) < Math.abs(stops[best].at - at) ? i : best,
        0,
      ),
    );
  };
  const active = hovered !== null ? stops[hovered] : undefined;
  const runsOutAt = forecast?.runsOutAt ? Date.parse(forecast.runsOutAt) : null;

  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <h2 className="text-sm font-semibold">{t("trendTitle")}</h2>
        {data ? (
          <ForecastSentence forecast={forecast} />
        ) : (
          <CardDescription className="mt-1 text-xs">
            {t("trendCumulativeHint")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={container} className="relative min-w-0">
          {query.isError && !data ? (
            <UsageLoadError onRetry={() => void query.refetch()} />
          ) : query.isPending || !width ? (
            <Skeleton className="h-[220px] w-full" />
          ) : !days.length ? (
            <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
              {t("historyEmpty")}
            </p>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${width} ${HEIGHT}`}
                width="100%"
                height={HEIGHT}
                role="img"
                aria-label={t("trendCumulativeSummary", {
                  percent: display(usedPercent),
                })}
                className="touch-pan-y"
                onPointerMove={(event) => hoverAt(event.clientX)}
                onPointerDown={(event) => hoverAt(event.clientX)}
                onPointerLeave={() => setHovered(null)}
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
                    y={HEIGHT - 7}
                    textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                    className="fill-muted-foreground text-[11px]"
                  >
                    {dayFormat.format(at)}
                  </text>
                ))}
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
                <g clipPath={`url(#${clipId})`}>
                  <path
                    d={`${actualLine} L${x(actual.at(-1)!.at)},${baseline} L${left},${baseline} Z`}
                    className="fill-primary/5"
                  />
                  <path
                    d={actualLine}
                    className="fill-none stroke-primary"
                    strokeWidth={2}
                  />
                  {forecastLine && (
                    <path
                      d={forecastLine}
                      data-testid="usage-forecast-line"
                      className={cn(
                        "fill-none",
                        forecast?.status === "short"
                          ? "stroke-destructive"
                          : "stroke-primary/70",
                      )}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                  )}
                </g>
                {runsOutAt !== null && (
                  <circle
                    cx={x(runsOutAt)}
                    cy={y(100)}
                    r={3.5}
                    className="fill-destructive"
                  />
                )}
                {active && (
                  <>
                    <line
                      x1={x(active.at)}
                      x2={x(active.at)}
                      y1={top}
                      y2={baseline}
                      className="stroke-muted-foreground/50"
                      strokeDasharray="3 4"
                    />
                    <circle
                      cx={x(active.at)}
                      cy={y(Math.min(active.percent, max))}
                      r={3.5}
                      className={
                        active.forecast
                          ? "fill-background stroke-primary"
                          : "fill-primary"
                      }
                      strokeWidth={active.forecast ? 2 : 0}
                    />
                  </>
                )}
              </svg>
              {active && (
                <div
                  role="status"
                  className={cn(
                    "pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border border-border bg-popover px-2.5 py-2 text-xs leading-snug text-popover-foreground shadow-md",
                    x(active.at) > width / 2 ? "-translate-x-full" : undefined,
                  )}
                  style={{
                    left:
                      x(active.at) > width / 2
                        ? x(active.at) - 10
                        : x(active.at) + 10,
                  }}
                >
                  <span className="block font-medium">{active.label}</span>
                  <span className="mt-1 flex items-center justify-between gap-4 text-muted-foreground">
                    <span>
                      {t(active.forecast ? "trendForecast" : "trendActual")}
                    </span>
                    <span className="tabular-nums">
                      {active.forecast
                        ? forecastDisplay(active.percent)
                        : display(active.percent)}
                    </span>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
        {forecastLine && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/80">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden />
              {t("trendActual")}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "w-4 border-t-2 border-dashed",
                  forecast?.status === "short"
                    ? "border-destructive"
                    : "border-primary/70",
                )}
                aria-hidden
              />
              {t("trendForecast")}
            </span>
          </div>
        )}
        {query.isError && data && (
          <p role="status" className="text-xs text-destructive">
            {t("usageRefreshFailed")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * What each day consumed, stacked by usage type. Hovering a day shows its
 * breakdown in a card on the chart, as in the admin Costs tab (MIN-946).
 */
export function DailyUsageChart() {
  const t = useTranslations("Billing");
  const locale = useLocale();
  const { usage } = useBillingSummary();
  const query = useBillingUsageAnalytics(usage);
  const data = query.data;
  const budget = data?.includedUsd ?? 0;
  const dayFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  // Two significant digits: a light day still reads as a value, not "0 %".
  const percentFormat = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumSignificantDigits: 2,
  });
  const series = useMemo(() => {
    const days = data?.days ?? [];
    const percentOf = (usd: number) => (budget > 0 ? (usd / budget) * 100 : 0);
    return {
      // Only the types used this period: an empty one would only add a legend.
      keys: USAGE_SEGMENTS.map((segment) => segment.id).filter((id) =>
        days.some((day) =>
          day.segments.some((segment) => segment.id === id && segment.usd > 0),
        ),
      ),
      days: days.map((day) => ({
        day: day.day,
        values: Object.fromEntries(
          day.segments.map((segment) => [segment.id, percentOf(segment.usd)]),
        ),
      })),
    };
  }, [data, budget]);

  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <h2 className="text-sm font-semibold">{t("dailyTitle")}</h2>
        <CardDescription className="mt-1 text-xs">
          {t("trendDailyHint")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isError && !data ? (
          <UsageLoadError onRetry={() => void query.refetch()} />
        ) : query.isPending ? (
          <Skeleton className="h-44 w-full" />
        ) : (
          <StackedBarChart
            series={series}
            styles={(key) => {
              const segment = USAGE_SEGMENTS.find((s) => s.id === key)!;
              return {
                label: t(SEGMENT_UI[segment.id].labelKey),
                color: segment.barClass,
              };
            }}
            format={(value) => percentFormat.format(value / 100)}
            dayLabel={(day) => dayFormat.format(Date.parse(`${day}T00:00:00Z`))}
            totalLabel={t("dailyTotal")}
            emptyLabel={t("historyEmpty")}
          />
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
