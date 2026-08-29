"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronDown, History, RefreshCw } from "lucide-react";
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Skeleton,
  Spinner,
  cn,
} from "mangue-ui";
import { ModelBadge } from "@/components/model-badge";
import {
  Metric,
  StatsCard,
  StatsSection,
  TotalItem,
} from "@/components/stats/stats-chrome";
import type { AdminFinance, AdminFinanceDay } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  ADMIN_SECTIONS,
  adminSectionAnchor,
} from "@/lib/admin-sections";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * `/admin` → “Finances” tab (MIN-92). The screen answers ONE question: is it
 * that we make money? Hence the two halves of the equation side by side —
 * what comes in (Stripe, collected net of fees and reimbursements) and what
 * sort (OpenRouter, converted at each day's rate).
 *
 * The Stripe half is CONDITIONAL (MIN-416): an instance without a connected
 * billing integration has no revenue, no MRR and no margin to read — only
 * the cost side renders there. `finance.stripe.configured` is the server's
 * own word on the matter; nothing is guessed client-side.
 *
 * The graph is DIVERGENT: income rises above the baseline,
 * cost goes below, on ONE scale in euros. Two scales
 * distinct (one axis per series) would give an image of the margin purely
 * decorative — one would read a crossing where there is none.
 *
 * Takes the chrome from `/statistics` (`stats-chrome`), like the overview:
 * an admin doesn't have to learn a second visual grammar.
 *
 * Access locked on the server side by `app/(app)/admin/layout.tsx` + the API.
 */

/**
 * The translator of the `Admin` namespace, as passed by subcomponents
 * of this file. The namespace is not decorative: `ReturnType<typeof
 * useTranslations>` (without an argument) types `t` against the 2,600 keys in the catalog,
 * and TypeScript then gives up on a “type instantiation is excessively
 * deep” (TS2589) — so no more checks on these calls.
 */
type AdminT = ReturnType<typeof useTranslations<"Admin">>;

const FEATURES = [
  "numo_chat",
  "numo_comment",
  "dictation",
  "transcription",
  "smart_assign",
  // Smart-fill (MIN-260): the other half of the “Automations” line on the
  // user, but its own feature here — it's finance, we read the
  // costs one by one.
  "smart_fill",
  "feedback_classify",
  "feedback_analyze",
  // Dictated feedback (public board + dashboard): listening AND storage by Numo
  // under the same run, so “average cost / run” = the price of a catch.
  "feedback_voice",
  "embedding",
  "agent_code",
  // Sandbox machine time, not an LLM call: the Tokens column remains
  // blank for these lines.
  "sandbox_compute",
  // Web search (OpenRouter plugin): the cost includes the search package
  // in addition to the sub-call tokens.
  "web_search",
  // Review of a PR by Numo (MIN-141): a call, on a more expensive model than
  // that of the agent — this is the line that answers “how much does a review cost?” ".
  "pr_review",
  // A ROUTINE (MIN-185): the same engine as `agent_code`/`sandbox_compute`,
  // on its own lines — this is where you read what the cost, in dollars, of this
  // which runs by itself in the accounts.
  "routine_code",
  "routine_compute",
  // CSV import column mapping (MIN-98): one call per file.
  "import_map",
  // Breaking a brief into objectives + tickets (MIN-172): one call per brief.
  "brief_split",
  // Landing Dictation Demo (MIN-150): the ONLY line that no one
  // pays — a visitor without an account, to whom the platform offers passage. A
  // run = a demo played, so “average cost/run” is the price of a run.
  "landing_demo",
] as const;
type Feature = (typeof FEATURES)[number];

const WINDOWS = [7, 30, 90] as const;

/**
 * The two poles of the graph. Validated pair (data-viz method): separation
 * CVD ΔE 10.1 and contrast ≥ 3:1 on bright AND dark background, with the same
 * tints in both modes. The position above/below the line
 * Basic remains the primary encoding — color only confirms.
 */
const REVENUE_COLOR = "bg-emerald-600";
const COST_COLOR = "bg-orange-600";

interface Totals {
  cost: number;
  calls: number;
  runs: number;
  tokens: number;
}
interface FeatureRow {
  feature: string;
  cost: number;
  calls: number;
  tokens: number;
  runs: number;
  avg_cost_per_run: number;
  avg_cost_per_call: number;
}
interface RunRow {
  run_id: string;
  feature: string;
  cost: number;
  calls: number;
  tokens: number;
  first_at: string;
  model: string | null;
}
interface Stats {
  since: string;
  totals: Totals;
  by_feature: FeatureRow[];
  recent_runs: RunRow[];
}
interface RunCall {
  id: string;
  seq: number;
  feature: string;
  model: string | null;
  generation_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
  /**
   * CALCULATED cost, not reported (MIN-216): an abandoned stream test is
   * billed without the `usage` object ever arriving. Shown “≈” — the margin
   * of the month should not be compared to dollars that have never been recorded.
   */
  estimated?: boolean;
  created_at: string;
}

/** Cost USD: many calls are worth a fraction of a cent → high accuracy. */
function fmtCost(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(6)}`;
  if (v < 1) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}
function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}
function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AdminFinanceDashboard() {
  const t = useTranslations("Admin");
  const [days, setDays] = useState(30);
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const featureLabel = useCallback(
    (feature: string) =>
      FEATURES.includes(feature as Feature)
        ? // `feature` comes from the API: key assembled at runtime, kept by
          // the `FEATURES.includes` just above.
          t(`finance.features.${feature}` as MessageKey<"Admin">)
        : feature,
    [t],
  );

  const load = useCallback(
    async (window: number, refresh: boolean) => {
      const [financeRes, statsRes] = await Promise.all([
        fetch(`/api/admin/finance?days=${window}${refresh ? "&refresh=1" : ""}`),
        fetch(`/api/admin/ai-usage?days=${window}`),
      ]);
      if (!financeRes.ok) throw new Error(`HTTP ${financeRes.status}`);
      if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);
      const financeData = (await financeRes.json()) as AdminFinance;
      const statsData = (await statsRes.json()) as { stats: Stats };
      return { financeData, statsData: statsData.stats };
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { financeData, statsData } = await load(days, false);
        if (!alive) return;
        setFinance(financeData);
        setStats(statsData);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [days, load]);

  /** The “Refresh” button: bypasses the server cache and retypes Stripe. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { financeData, statsData } = await load(days, true);
      setFinance(financeData);
      setStats(statsData);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [days, load]);

  const byFeature = useMemo(
    () => [...(stats?.by_feature ?? [])].sort((a, b) => b.cost - a.cost),
    [stats],
  );

  return (
    /* The width and margins come from the shell (`admin-dashboard`): the
 tabs share a single container, otherwise their contents do not align
 across tabs. */
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{t("finance.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("finance.subtitle")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted p-[3px]">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                days === w
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("finance.window", { days: w })}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("finance.loadError")}
        </div>
      ) : loading || !finance || !stats ? (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div
            id={adminSectionAnchor(ADMIN_SECTIONS.financeSummary)}
            className="scroll-mt-20 rounded-xl"
          >
            <MoneyTiles finance={finance} t={t} />
          </div>

          {!finance.stripe.configured ? (
            <p className="text-xs text-muted-foreground">{t("finance.stripeHidden")}</p>
          ) : null}

          <FreshnessBar
            finance={finance}
            refreshing={refreshing}
            onRefresh={refresh}
            t={t}
          />

          <StatsSection
            id={adminSectionAnchor(ADMIN_SECTIONS.financeChart)}
            title={t("finance.chartTitle")}
            info={t("finance.chartInfo")}
          >
            <StatsCard className="flex flex-col gap-4">
              <MarginChart days={finance.days} revenue={finance.stripe.configured} t={t} />
            </StatsCard>
          </StatsSection>

          <SpendCap finance={finance} t={t} />

          <StatsSection
            id={adminSectionAnchor(ADMIN_SECTIONS.financeByType)}
            title={t("finance.byType")}
          >
            <FeatureTable rows={byFeature} featureLabel={featureLabel} t={t} />
          </StatsSection>

          {/* The runs are POINTUAL consultation information: they do not take
 plus the whole page, they wait to be requested. */}
          <StatsSection
            id={adminSectionAnchor(ADMIN_SECTIONS.financeLogs)}
            title={t("finance.logs")}
          >
            <RecentRunsAccordion
              runs={stats.recent_runs}
              featureLabel={featureLabel}
              t={t}
            />
          </StatsSection>
        </>
      )}
    </div>
  );
}

// ── the actual figures for the month ─────────────────────── ────────────────────────

function MoneyTiles({
  finance,
  t,
}: {
  finance: AdminFinance;
  t: AdminT;
}) {
  const format = useFormatter();
  const eur = (value: number | null) =>
    value === null
      ? "—"
      : format.number(value, { style: "currency", currency: "EUR" });

  // Without a connected billing integration the revenue half of the equation
  // does not exist: no collection, no MRR, and a margin against zero income
  // would be noise. The cost tile takes the whole width (MIN-416).
  if (!finance.stripe.configured) {
    return (
      <StatsCard className="grid grid-cols-1">
        <Metric
          variant="hero"
          label={t("finance.monthCost")}
          value={eur(finance.month.costEur)}
          hint={t("finance.monthCostUsd", {
            amount: `$${finance.month.costUsd.toFixed(2)}`,
          })}
          info={t("finance.monthCostInfo")}
        />
      </StatsCard>
    );
  }

  const margin = finance.month.marginEur;

  return (
    <StatsCard className="grid grid-cols-1 gap-5 divide-y divide-border sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-y-0">
      <Metric
        variant="hero"
        className="sm:pr-5"
        label={t("finance.netCollected")}
        value={eur(finance.month.netCollectedEur)}
        hint={t("finance.stripeFees", {
          amount: format.number(finance.month.stripeFeesEur, {
            style: "currency",
            currency: "EUR",
          }),
        })}
        info={t("finance.netCollectedInfo")}
      />
      <Metric
        variant="hero"
        className="pt-5 sm:px-5 sm:pt-0"
        label={t("finance.mrr")}
        value={eur(finance.mrrEur)}
        hint={t("finance.payingAccounts", { count: finance.payingAccounts })}
        info={t("finance.mrrInfo")}
      />
      <Metric
        variant="hero"
        className="pt-5 sm:px-5 sm:pt-0"
        label={t("finance.monthCost")}
        value={eur(finance.month.costEur)}
        hint={t("finance.monthCostUsd", {
          amount: `$${finance.month.costUsd.toFixed(2)}`,
        })}
        info={t("finance.monthCostInfo")}
      />
      <Metric
        variant="hero"
        className="pt-5 sm:pl-5 sm:pt-0"
        label={t("finance.margin")}
        value={
          <span
            className={cn(
              margin !== null && margin < 0 && "text-orange-600 dark:text-orange-500",
            )}
          >
            {eur(margin)}
          </span>
        }
        hint={t("finance.marginHint")}
        info={t("finance.marginInfo")}
      />
    </StatsCard>
  );
}

/** Origin and freshness: the rate with its date, Stripe with its timestamp. */
function FreshnessBar({
  finance,
  refreshing,
  onRefresh,
  t,
}: {
  finance: AdminFinance;
  refreshing: boolean;
  onRefresh: () => void;
  t: AdminT;
}) {
  const format = useFormatter();
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(finance.fetchedAt).getTime()) / 60000),
  );

  const rateDay = finance.fx
    ? format.dateTime(new Date(`${finance.fx.day}T00:00:00Z`), {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      {/* An amount converted without its rate is not verifiable; the date returns
          visible un cron de change en panne. */}
      <span>
        {finance.fx
          ? t("finance.fxRate", {
              rate: finance.fx.usdEur.toFixed(5),
              date: rateDay ?? "",
            })
          : t("finance.fxMissing")}
      </span>
      {/* The Stripe freshness only speaks when Stripe is part of the equation. */}
      {finance.stripe.configured ? (
        <>
          <span aria-hidden>·</span>
          <span>
            {finance.stripe.reachable
              ? t("finance.stripeFresh", { minutes })
              : t("finance.stripeUnreachable")}
          </span>
          {finance.stripe.testMode && (
            <Badge variant="secondary" className="h-5">
              {t("finance.testMode")}
            </Badge>
          )}
        </>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1.5 px-2"
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw className={cn("size-3", refreshing && "animate-spin")} />
        {t("finance.refresh")}
      </Button>
    </div>
  );
}

// ── the divergent graph ───────────────────────── ──────────────────────────

/**
 * One column per day: income goes up, cost goes down, around a line of
 * common basis. ONE euro scale for both directions — that's what
 * makes the comparison honest, and therefore the margin readable.
 *
 * `revenue` false (billing not connected, MIN-416): the cost series alone
 * remains, and the legend keeps only the entry that still means something.
 */
function MarginChart({
  days,
  revenue,
  t,
}: {
  days: AdminFinanceDay[];
  revenue: boolean;
  t: AdminT;
}) {
  const format = useFormatter();

  const scale = useMemo(
    () =>
      days.reduce(
        (max, day) => Math.max(max, revenue ? day.revenueEur : 0, day.costEur ?? 0),
        0,
      ),
    [days, revenue],
  );

  const eur = useCallback(
    (value: number | null) =>
      value === null
        ? "—"
        : format.number(value, {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 3 : 2,
          }),
    [format],
  );

  const dayLabel = useCallback(
    (iso: string) =>
      format.dateTime(new Date(`${iso}T00:00:00Z`), {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
    [format],
  );

  if (days.length === 0 || scale === 0) {
    return <p className="text-sm text-muted-foreground">{t("finance.noData")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Two series → systematic legend: identity is never based on
 the only color. */}
      <div className="flex items-center gap-4 text-xs">
        {revenue ? (
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[2px]", REVENUE_COLOR)} aria-hidden />
            <span className="text-muted-foreground">{t("finance.legendRevenue")}</span>
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[2px]", COST_COLOR)} aria-hidden />
          <span className="text-muted-foreground">{t("finance.legendCost")}</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-full gap-[2px]">
          {days.map((day) => {
            const revenueHeight = (day.revenueEur / scale) * 100;
            const costHeight = ((day.costEur ?? 0) / scale) * 100;
            return (
              // The hover target is the entire COLUMN: aim for a bar of
              // 2 px on an almost empty day would be impossible.
              <Tooltip key={day.day}>
                <TooltipTrigger asChild>
                  <div className="flex min-w-[3px] flex-1 flex-col">
                    {/* 96 px per half, not 56: a strip with a single series
 (the overview) may be low, a diverging graph
 splits its height in two and would lose its intermediate values ​​— a day at 30% of the maximum
 should remain a bar, not a dash. */}
                    {revenue ? (
                      <div className="flex h-24 items-end">
                        <div
                          className={cn(
                            "w-full rounded-t-[3px] transition-[height]",
                            day.revenueEur > 0 ? REVENUE_COLOR : "",
                          )}
                          style={
                            day.revenueEur > 0
                              ? { height: `${Math.max(revenueHeight, 3)}%` }
                              : undefined
                          }
                        />
                      </div>
                    ) : null}
                    {/* The baseline: zero is a real line, not a
                        limite implicite entre deux blocs de couleur. */}
                    <div className="h-px w-full bg-border" />
                    <div className="flex h-24 items-start">
                      <div
                        className={cn(
                          "w-full rounded-b-[3px] transition-[height]",
                          (day.costEur ?? 0) > 0 ? COST_COLOR : "",
                        )}
                        style={
                          (day.costEur ?? 0) > 0
                            ? { height: `${Math.max(costHeight, 3)}%` }
                            : undefined
                        }
                      />
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-medium">{dayLabel(day.day)}</span>
                  {revenue ? (
                    <>
                      <span className="mt-1 block text-background/70">
                        {t("finance.tooltipRevenue", { amount: eur(day.revenueEur) })}
                      </span>
                      <span className="block text-background/70">
                        {t("finance.tooltipCost", { amount: eur(day.costEur) })}
                      </span>
                      <span className="block text-background/70">
                        {t("finance.tooltipMargin", { amount: eur(day.marginEur) })}
                      </span>
                    </>
                  ) : (
                    <span className="mt-1 block text-background/70">
                      {t("finance.tooltipCost", { amount: eur(day.costEur) })}
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{dayLabel(days[0].day)}</span>
        <span>{dayLabel(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}

// ── expenditure safeguard ────────────────────────── ───────────────────────────

/**
 * The monthly limit of the minddy KEY. Saturating it cuts off Numo, dictation and
 * processing feedback until the following month — that's the real risk, not the
 * credits shortage (OpenRouter auto-refill takes care of this).
 */
function SpendCap({
  finance,
  t,
}: {
  finance: AdminFinance;
  t: AdminT;
}) {
  const format = useFormatter();
  const cap = finance.cap;

  if (!cap || cap.limitUsd === null) {
    return (
      <StatsSection
        id={adminSectionAnchor(ADMIN_SECTIONS.financeCap)}
        title={t("finance.capTitle")}
      >
        <StatsCard>
          <p className="text-sm text-muted-foreground">{t("finance.capUnavailable")}</p>
        </StatsCard>
      </StatsSection>
    );
  }

  const percent = cap.percent ?? 0;
  // 90% is the threshold that triggers the push notification (cron spend-guard):
  // the bar changes color in the same place, so that the screen and alert
  // tell the same story.
  const alerting = percent >= 90;

  return (
    <StatsSection
      id={adminSectionAnchor(ADMIN_SECTIONS.financeCap)}
      title={t("finance.capTitle")}
      info={t("finance.capInfo")}
    >
      <StatsCard className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {t("finance.capUsage", {
              usage: `$${cap.usageUsd.toFixed(2)}`,
              limit: `$${cap.limitUsd.toFixed(0)}`,
            })}
          </span>
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              alerting ? "text-orange-600 dark:text-orange-500" : "text-muted-foreground",
            )}
          >
            {t("finance.capPercent", { percent })}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              alerting ? "bg-orange-600" : "bg-foreground/70",
            )}
            style={{ width: `${Math.min(Math.max(percent, 1), 100)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <TotalItem
            label={t("finance.capRemaining")}
            value={cap.remainingUsd === null ? "—" : `$${cap.remainingUsd.toFixed(2)}`}
          />
          <TotalItem
            label={t("finance.capProjected")}
            value={
              cap.projectedExhaustionDay
                ? format.dateTime(
                    new Date(`${cap.projectedExhaustionDay}T00:00:00Z`),
                    { day: "numeric", month: "short", timeZone: "UTC" },
                  )
                : t("finance.capNotBeforeReset")
            }
            info={t("finance.capProjectedInfo")}
          />
          <TotalItem
            label={t("finance.capReset")}
            value={format.dateTime(new Date(`${cap.resetDay}T00:00:00Z`), {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            })}
          />
        </div>
      </StatsCard>
    </StatsSection>
  );
}

// ── tableau par type d'IA ────────────────────────────────────────────────────

function FeatureTable({
  rows,
  featureLabel,
  t,
}: {
  rows: FeatureRow[];
  featureLabel: (f: string) => string;
  t: AdminT;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        {t("finance.empty")}
      </p>
    );
  }
  return (
    /* `bg-card` like the other sections: without it the table showed the
 background and floated next to neighboring cards. No `StatsCard`
 here — its padding would remove the table from its border. */
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t("finance.colType")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("finance.colCost")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("finance.colRuns")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("finance.colCalls")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("finance.colAvgRun")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("finance.colAvgCall")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("finance.colTokens")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feature} className="border-b last:border-0">
              <td className="px-3 py-2 font-medium">{featureLabel(r.feature)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtCost(r.cost)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {fmtInt(r.runs)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {fmtInt(r.calls)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmtCost(r.avg_cost_per_run)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {fmtCost(r.avg_cost_per_call)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {fmtInt(r.tokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── the logs, put away ──────────────────────────── ─────────────────────────────

/** Accordion folded by default, on the pattern of `usage-history-section`. */
function RecentRunsAccordion({
  runs,
  featureLabel,
  t,
}: {
  runs: RunRow[];
  featureLabel: (f: string) => string;
  t: AdminT;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-border bg-card"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex min-w-0 items-center gap-2.5">
          <History className="size-4 shrink-0 text-foreground/70" strokeWidth={2} />
          <span className="text-sm font-semibold">{t("finance.recentRuns")}</span>
          <span className="truncate text-xs text-muted-foreground">
            {t("finance.recentRunsHint")}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border">
          {runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("finance.empty")}
            </p>
          ) : (
            <div className="divide-y">
              {runs.map((run) => (
                <RunRowItem
                  key={run.run_id}
                  run={run}
                  featureLabel={featureLabel}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RunRowItem({
  run,
  featureLabel,
  t,
}: {
  run: RunRow;
  featureLabel: (f: string) => string;
  t: AdminT;
}) {
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<RunCall[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && calls === null && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/ai-usage?run=${run.run_id}`);
        if (res.ok) {
          const data = (await res.json()) as { calls: RunCall[] };
          setCalls(data.calls ?? []);
        } else {
          setCalls([]);
        }
      } catch {
        setCalls([]);
      } finally {
        setLoading(false);
      }
    }
  }, [open, calls, loading, run.run_id]);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
      >
        <span
          className={cn(
            "text-xs text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        >
          ▶
        </span>
        <span className="font-medium">{featureLabel(run.feature)}</span>
        {run.calls > 1 && (
          <Badge variant="secondary" className="shrink-0">
            {t("finance.callCount", { count: run.calls })}
          </Badge>
        )}
        <span className="ml-auto shrink-0 tabular-nums">{fmtCost(run.cost)}</span>
        <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
          {fmtTime(run.first_at)}
        </span>
      </button>

      {open && (
        <div className="bg-muted/20 px-3 pb-3 pl-9">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Spinner className="size-3" /> {t("finance.loadingCalls")}
            </div>
          ) : !calls || calls.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">{t("finance.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">#</th>
                    <th className="py-1 pr-3 font-medium">{t("finance.colModel")}</th>
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("finance.colPrompt")}
                    </th>
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("finance.colCompletion")}
                    </th>
                    <th className="py-1 text-right font-medium">
                      {t("finance.colCost")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-t border-border/50">
                      <td className="py-1 pr-3 tabular-nums text-muted-foreground">
                        {c.seq + 1}
                      </td>
                      {/* The model is read by its brand, not by its slug
 OpenRouter: logo + formatted name, raw id on hover. */}
                      <td className="py-1 pr-3">
                        {c.model ? (
                          <ModelBadge model={c.model} size={12} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                        {fmtInt(c.prompt_tokens)}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                        {fmtInt(c.completion_tokens)}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {c.estimated ? "≈ " : ""}
                        {fmtCost(c.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
