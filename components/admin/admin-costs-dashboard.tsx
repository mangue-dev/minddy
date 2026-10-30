"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, FilterIcon, Globe02Icon, SparklesIcon, WorkHistoryIcon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FilterItem, FilterMenu, FilterSub, MenuToggleRow } from "@/components/filter-menu";
import { AdminHeaderActions } from "@/components/admin/admin-header-slot";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/icon";
import { ModelBadge } from "@/components/model-badge";
import { ModelLogo } from "@/components/model-logo";
import { EmptyState } from "@/components/empty-state";
import { SEGMENT_UI } from "@/components/billing/usage-segment-ui";
import { ChangeBadge, Sparkline, StackedBarChart, type SeriesStyle } from "@/components/admin/cost-charts";
import type { AdminFinance } from "@/lib/types";
import type { MessageKey } from "@/lib/i18n-keys";
import { formatModelName } from "@/lib/model-display";
import {
  ADMIN_COST_GROUPS,
  costGroupOf,
  costTotals,
  dailyValues,
  filterCostRows,
  NO_FILTERS,
  OTHER_SERIES,
  rankBy,
  relativeChange,
  splitPeriods,
  stackedSeries,
  windowDays,
  type AdminCostGroupId,
  type CostFilters,
} from "@/lib/admin-costs";
import { ADMIN_SECTIONS, adminSectionAnchor } from "@/lib/admin-sections";

/**
 * `/admin` → “Costs” tab (MIN-92, MIN-829). Modelled on the activity page of
 * OpenRouter: four headline figures, each with its trend and its change
 * against the previous period; who spends (features) and on what (models);
 * then the same spending per day, by model and by family. Everything follows
 * the period and the filters at the top. Revenue, MRR and margin left with the
 * commercial dashboard.
 *
 * Amounts are in dollars, the ledger's currency, like OpenRouter's.
 *
 * Access locked on the server side by `app/(app)/admin/layout.tsx` + the API.
 */

/**
 * The translator of the `Admin` namespace, as passed to the subcomponents of
 * this file. Without the namespace, `ReturnType<typeof useTranslations>` types
 * `t` against every key of the catalog and TypeScript gives up (TS2589).
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
  // AI decisions (MIN-561, MIN-694): the decision-model calls of the AI
  // decision layer, whichever model is configured (historical `jev_` id; the
  // ledger row names the model that answered). Priced on input tokens only —
  // the line answers “how much do the automated decisions cost, apart from
  // the LLM passes?”.
  "jev_decision",
  // Shadow comparison of the decision layer (MIN-567): the LLM pass replayed
  // on a ~5% sample after a confident decision-model decision. The line answers "what
  // does measuring the decisions cost, on top of the decisions?"
  "jev_shadow",
  // Smart Fill relations (MIN-717): issue indexing, and the LLM fallback of
  // the relation decision. Read apart from Smart Fill's own field pass.
  "issue_embedding",
  "issue_relation",
  // Issue search by meaning (MIN-718): one query embedding per distinct search.
  "issue_search",
  // FAQ question box (MIN-590): a visitor's question, paid by the instance.
  "faq_ask",
  // Landing Dictation Demo (MIN-150): the ONLY line that no one
  // pays — a visitor without an account, to whom the platform offers passage. A
  // run = a demo played, so “average cost/run” is the price of a run.
  "landing_demo",
] as const;
type Feature = (typeof FEATURES)[number];

const PERIODS = [7, 30, 90] as const;
const RUNS_PAGE_SIZE = 10;
const SERIES_LIMIT = 5;
/** The server caches the ledger for five minutes: polling faster reads nothing new. */
const BACKGROUND_REFRESH_MS = 5 * 60 * 1000;

/** Fixed tints, contrast ≥ 3:1 on light and dark backgrounds; “other” stays gray. */
const MODEL_COLORS = [
  "bg-pink-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-lime-500",
];
const OTHER_COLOR = "bg-slate-400";

/** The feature families, in the icons and colors billing already uses. */
const GROUP_UI: Record<AdminCostGroupId, { icon: AppIcon; text: string; bar: string; labelKey: MessageKey<"Admin"> }> = {
  numo: { icon: SEGMENT_UI.numo.icon, text: SEGMENT_UI.numo.text, bar: "bg-blue-500", labelKey: "costs.groups.numo" },
  routines: { icon: SEGMENT_UI.routines.icon, text: SEGMENT_UI.routines.text, bar: "bg-sky-500", labelKey: "costs.groups.routines" },
  automations: { icon: SEGMENT_UI.automations.icon, text: SEGMENT_UI.automations.text, bar: "bg-fuchsia-500", labelKey: "costs.groups.automations" },
  dictation: { icon: SEGMENT_UI.dictation.icon, text: SEGMENT_UI.dictation.text, bar: "bg-amber-500", labelKey: "costs.groups.dictation" },
  feedback: { icon: SEGMENT_UI.feedback.icon, text: SEGMENT_UI.feedback.text, bar: "bg-emerald-500", labelKey: "costs.groups.feedback" },
  site: { icon: Globe02Icon, text: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500", labelKey: "costs.groups.site" },
  other: { icon: SparklesIcon, text: "text-slate-500 dark:text-slate-400", bar: OTHER_COLOR, labelKey: "costs.groups.other" },
};

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
  recent_runs: RunRow[];
}
interface RunCall {
  id: string;
  seq: number;
  feature: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost: number | null;
  /**
   * CALCULATED cost, not reported (MIN-216): an abandoned stream is billed
   * without the `usage` object ever arriving. Shown “≈”.
   */
  estimated?: boolean;
}

/** USD with enough digits for calls worth a fraction of a cent. */
function fmtCost(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v === 0) return "$0";
  if (v < 0.0001) return "<$0.0001";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString();
}

export function AdminCostsDashboard() {
  const t = useTranslations("Admin");
  const tCommon = useTranslations("Common");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const format = useFormatter();
  const [days, setDays] = useState<number>(30);
  const [filters, setFilters] = useState<CostFilters>(NO_FILTERS);
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const featureLabel = useCallback(
    (feature: string) =>
      FEATURES.includes(feature as Feature)
        ? // `feature` comes from the API: key assembled at runtime, kept by
          // the `FEATURES.includes` just above.
          t(`costs.features.${feature}` as MessageKey<"Admin">)
        : feature,
    [t],
  );
  const modelLabel = useCallback(
    (model: string) => (model ? formatModelName(model) || model : t("costs.noModel")),
    [t],
  );

  const load = useCallback(async (window: number, refresh: boolean) => {
    const [financeRes, statsRes] = await Promise.all([
      fetch(`/api/admin/finance?days=${window}${refresh ? "&refresh=1" : ""}`),
      fetch(`/api/admin/ai-usage?days=${window}`),
    ]);
    if (!financeRes.ok) throw new Error(`HTTP ${financeRes.status}`);
    if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);
    return {
      financeData: (await financeRes.json()) as AdminFinance,
      statsData: ((await statsRes.json()) as { stats: Stats }).stats,
    };
  }, []);

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

  // Quietly re-read while the tab stays open and visible: a failed background
  // read keeps the figures already on screen.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load(days, false)
        .then(({ financeData, statsData }) => {
          setFinance(financeData);
          setStats(statsData);
        })
        .catch(() => {});
    }, BACKGROUND_REFRESH_MS);
    return () => clearInterval(timer);
  }, [days, load]);

  const view = useMemo(() => {
    if (!finance) return null;
    const dayList = windowDays(finance.windowStartDay, finance.windowDays);
    const { current: allCurrent } = splitPeriods(finance.breakdown, finance.windowStartDay);
    const filtered = filterCostRows(finance.breakdown, filters);
    const { current, previous } = splitPeriods(filtered, finance.windowStartDay);
    // A model keeps its color everywhere on the page: its rank by spend.
    const modelRank = rankBy(current, (row) => row.model).map((entry) => entry.key);
    return {
      dayList,
      current,
      totals: costTotals(current),
      previousTotals: costTotals(previous),
      hasPrevious: previous.length > 0,
      models: rankBy(allCurrent, (row) => row.model).map((entry) => entry.key),
      modelRank,
      topFeatures: rankBy(current, (row) => row.feature),
      topModels: rankBy(current, (row) => row.model),
      byModel: stackedSeries(current, dayList, (row) => row.model, (row) => row.costUsd, SERIES_LIMIT),
      byGroup: stackedSeries(current, dayList, (row) => costGroupOf(row.feature), (row) => row.costUsd, ADMIN_COST_GROUPS.length),
      requestsByModel: stackedSeries(current, dayList, (row) => row.model, (row) => row.calls, SERIES_LIMIT),
    };
  }, [finance, filters]);

  const modelStyle = useCallback(
    (key: string): SeriesStyle => {
      if (key === OTHER_SERIES) return { label: t("costs.otherSeries"), color: OTHER_COLOR };
      const rank = view?.modelRank.indexOf(key) ?? -1;
      return { label: modelLabel(key), color: rank >= 0 && rank < MODEL_COLORS.length ? MODEL_COLORS[rank] : OTHER_COLOR };
    },
    [modelLabel, t, view],
  );
  const groupStyle = useCallback(
    (key: string): SeriesStyle => {
      const ui = GROUP_UI[key as AdminCostGroupId] ?? GROUP_UI.other;
      return { label: t(ui.labelKey), color: ui.bar };
    },
    [t],
  );
  const dayLabel = useCallback(
    (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" }),
    [format],
  );
  const compact = useCallback(
    (value: number) => format.number(value, { notation: "compact", maximumFractionDigits: 1 }),
    [format],
  );

  const filtered = filters.group !== "all" || filters.model !== "all" || filters.keyMode !== "all";

  return (
    /* The width and margins come from the shell (`admin-dashboard`). */
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-sm font-semibold">{t("costs.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("costs.subtitle")}</p>
      </header>
      {/* The filters and the period drive the whole tab: they sit in the
          pane's header, the filters behind one button as on the board. */}
      <AdminHeaderActions>
        <FilterMenu
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          label={tCommon("filters")}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={tCommon("filters")}>
              <HugeiconsIcon icon={FilterIcon} className={cn("size-4", filtered && "text-primary")} />
            </Button>
          }
        >
          <FilterSub label={t("costs.facetFeature")} count={filters.group === "all" ? 0 : 1}>
            {ADMIN_COST_GROUPS.map((group) => (
              <MenuToggleRow
                key={group}
                active={filters.group === group}
                onSelect={() => setFilters((prev) => ({ ...prev, group: prev.group === group ? "all" : group }))}
              >
                <AppIcon icon={GROUP_UI[group].icon} className={cn("size-3.5", GROUP_UI[group].text)} strokeWidth={2} />
                <span className="truncate">{t(GROUP_UI[group].labelKey)}</span>
              </MenuToggleRow>
            ))}
          </FilterSub>
          {(view?.models.length ?? 0) > 0 && (
            <FilterSub label={t("costs.facetModel")} count={filters.model === "all" ? 0 : 1}>
              {(view?.models ?? []).map((model) => (
                <MenuToggleRow
                  key={model || "none"}
                  active={filters.model === model}
                  onSelect={() => setFilters((prev) => ({ ...prev, model: prev.model === model ? "all" : model }))}
                >
                  {model ? <ModelLogo model={model} size={14} /> : null}
                  <span className="truncate">{modelLabel(model)}</span>
                </MenuToggleRow>
              ))}
            </FilterSub>
          )}
          <FilterSub label={t("costs.filterKey")} count={filters.keyMode === "all" ? 0 : 1}>
            {(["platform", "byok"] as const).map((keyMode) => (
              <MenuToggleRow
                key={keyMode}
                active={filters.keyMode === keyMode}
                onSelect={() => setFilters((prev) => ({ ...prev, keyMode: prev.keyMode === keyMode ? "all" : keyMode }))}
              >
                <span className="truncate">{t(keyMode === "platform" ? "costs.keyPlatform" : "costs.keyByok")}</span>
              </MenuToggleRow>
            ))}
          </FilterSub>
          <DropdownMenuSeparator />
          <FilterItem disabled={!filtered} onSelect={() => setFilters(NO_FILTERS)}>
            {t("costs.clearFilters")}
          </FilterItem>
        </FilterMenu>
        <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
          {/* A pill like every control of the content header, so its ends stay
              concentric with the pane's corner. */}
          <SelectTrigger size="sm" className="w-auto rounded-full data-[size=sm]:rounded-full" aria-label={t("costs.periodLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {PERIODS.map((period) => (
              <SelectItem key={period} value={String(period)}>
                {t("costs.period", { days: period })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </AdminHeaderActions>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("costs.loadError")}
        </div>
      ) : loading || !finance || !stats || !view ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <section
            id={adminSectionAnchor(ADMIN_SECTIONS.costsSummary)}
            aria-label={t("costs.summaryTitle")}
            className="flex scroll-mt-20 flex-col gap-2 rounded-xl"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                label={t("costs.kpiSpend")}
                value={fmtCost(view.totals.costUsd)}
                trend={dailyValues(view.current, view.dayList, (row) => row.costUsd)}
                tone="text-orange-500"
                change={view.hasPrevious ? relativeChange(view.totals.costUsd, view.previousTotals.costUsd) : null}
                t={t}
              />
              <KpiCard
                label={t("costs.kpiRequests")}
                value={compact(view.totals.calls)}
                trend={dailyValues(view.current, view.dayList, (row) => row.calls)}
                tone="text-blue-500"
                change={view.hasPrevious ? relativeChange(view.totals.calls, view.previousTotals.calls) : null}
                t={t}
              />
              <KpiCard
                label={t("costs.kpiTokens")}
                value={compact(view.totals.tokens)}
                trend={dailyValues(view.current, view.dayList, (row) => row.promptTokens + row.completionTokens)}
                tone="text-violet-500"
                change={view.hasPrevious ? relativeChange(view.totals.tokens, view.previousTotals.tokens) : null}
                t={t}
              />
              <KpiCard
                label={t("costs.kpiCostPerMillion")}
                value={view.totals.costPerMillion === null ? "—" : fmtCost(view.totals.costPerMillion)}
                trend={view.dayList.map((day) => {
                  const rows = view.current.filter((row) => row.day === day);
                  return costTotals(rows).costPerMillion ?? 0;
                })}
                tone="text-emerald-500"
                change={view.hasPrevious ? relativeChange(view.totals.costPerMillion, view.previousTotals.costPerMillion) : null}
                t={t}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankCard
              id={adminSectionAnchor(ADMIN_SECTIONS.costsByFeature)}
              title={t("costs.topFeaturesTitle")}
              empty={t("costs.empty")}
              entries={view.topFeatures.slice(0, 6).map((entry) => {
                const ui = GROUP_UI[costGroupOf(entry.key)];
                return {
                  key: entry.key,
                  leading: <AppIcon icon={ui.icon} className={cn("size-4 shrink-0", ui.text)} strokeWidth={2} />,
                  label: featureLabel(entry.key),
                  detail: t(ui.labelKey),
                  value: fmtCost(entry.costUsd),
                  share: view.totals.costUsd > 0 ? entry.costUsd / view.totals.costUsd : 0,
                  shareColor: ui.bar,
                };
              })}
            />
            <RankCard
              title={t("costs.topModelsTitle")}
              empty={t("costs.empty")}
              entries={view.topModels.slice(0, 6).map((entry) => ({
                key: entry.key || "none",
                leading: entry.key ? <ModelLogo model={entry.key} size={16} /> : <span className={cn("size-2.5 rounded-full", OTHER_COLOR)} />,
                label: modelLabel(entry.key),
                detail: t("costs.callCount", { count: entry.calls }),
                value: fmtCost(entry.costUsd),
                share: view.totals.costUsd > 0 ? entry.costUsd / view.totals.costUsd : 0,
                shareColor: modelStyle(entry.key).color,
              }))}
            />
          </div>

          <ChartCard id={adminSectionAnchor(ADMIN_SECTIONS.costsChart)} title={t("costs.spendByModelTitle")}>
            <StackedBarChart
              series={view.byModel}
              styles={modelStyle}
              format={fmtCost}
              dayLabel={dayLabel}
              totalLabel={t("costs.total")}
              emptyLabel={t("costs.noData")}
              height="h-56"
            />
          </ChartCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title={t("costs.spendByGroupTitle")}>
              <StackedBarChart
                series={view.byGroup}
                styles={groupStyle}
                format={fmtCost}
                dayLabel={dayLabel}
                totalLabel={t("costs.total")}
                emptyLabel={t("costs.noData")}
              />
            </ChartCard>
            <ChartCard title={t("costs.requestsByModelTitle")}>
              <StackedBarChart
                series={view.requestsByModel}
                styles={modelStyle}
                format={compact}
                dayLabel={dayLabel}
                totalLabel={t("costs.total")}
                emptyLabel={t("costs.noData")}
              />
            </ChartCard>
          </div>

          <RecentRuns
            runs={stats.recent_runs}
            featureLabel={featureLabel}
            t={t}
          />
        </>
      )}
    </div>
  );
}

// ── headline figures ─────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  trend,
  tone,
  change,
  t,
}: {
  label: string;
  value: string;
  trend: number[];
  tone: string;
  change: number | null;
  t: AdminT;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        </div>
        <Sparkline values={trend} className={cn("shrink-0", tone)} />
      </div>
      <ChangeBadge change={change} label={change === null ? t("costs.noPrevious") : t("costs.vsPrevious")} />
    </div>
  );
}

// ── top lists and chart frames ───────────────────────────────────────────

function ChartCard({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function RankCard({
  id,
  title,
  subtitle,
  empty,
  entries,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  empty: string;
  entries: Array<{
    key: string;
    leading: React.ReactNode;
    label: string;
    detail: string;
    value: string;
    share: number;
    shareColor: string;
  }>;
}) {
  const format = useFormatter();
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <li key={entry.key} className="flex items-center gap-3">
              <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
              <span className="flex size-5 shrink-0 items-center justify-center">{entry.leading}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{entry.label}</span>
                  <span className="shrink-0 text-sm tabular-nums">{entry.value}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", entry.shareColor)} style={{ width: `${Math.max(entry.share * 100, entry.share > 0 ? 2 : 0)}%` }} />
                  </div>
                  <span className="w-28 shrink-0 truncate text-right text-[11px] text-muted-foreground">
                    {format.number(entry.share, { style: "percent" })} · {entry.detail}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── recent runs, in the grammar of the billing usage history ─────────────

/**
 * The runs of the period, like the Billing page's usage history: one row per
 * run with its family icon, its feature and when it ran, plus — admin only —
 * its model and its exact cost. A row opens on its calls.
 */
function RecentRuns({
  runs,
  featureLabel,
  t,
}: {
  runs: RunRow[];
  featureLabel: (f: string) => string;
  t: AdminT;
}) {
  const [open, setOpen] = useState(true);
  const [group, setGroup] = useState<AdminCostGroupId | "all">("all");
  const [page, setPage] = useState(0);
  const shown = useMemo(
    () => runs.filter((run) => group === "all" || costGroupOf(run.feature) === group),
    [group, runs],
  );
  const pages = Math.max(1, Math.ceil(shown.length / RUNS_PAGE_SIZE));
  const current = shown.slice(page * RUNS_PAGE_SIZE, (page + 1) * RUNS_PAGE_SIZE);

  return (
    <Collapsible
      id={adminSectionAnchor(ADMIN_SECTIONS.costsLogs)}
      open={open}
      onOpenChange={setOpen}
      className="scroll-mt-20 rounded-xl border border-border bg-card"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <HugeiconsIcon icon={WorkHistoryIcon} className="size-4 shrink-0 text-foreground/70" strokeWidth={2} />
          <span className="text-sm font-semibold">{t("costs.logsTitle")}</span>
          <span className="w-full text-xs text-muted-foreground sm:w-auto">{t("costs.recentRunsHint")}</span>
        </div>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border">
          <div className="flex justify-end px-4 py-3">
            <Select
              value={group}
              onValueChange={(value) => {
                setGroup(value as AdminCostGroupId | "all");
                setPage(0);
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-60" aria-label={t("costs.filterFamily")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">{t("costs.filterFamily")}</SelectItem>
                {ADMIN_COST_GROUPS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(GROUP_UI[id].labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {shown.length === 0 ? (
            <div className="border-t border-border p-4">
              <EmptyState icon={<HugeiconsIcon icon={WorkHistoryIcon} className="size-6" />} description={t("costs.empty")} />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border border-t border-border">
                {current.map((run) => (
                  <RunRowItem key={run.run_id} run={run} featureLabel={featureLabel} t={t} />
                ))}
              </ul>
              {pages > 1 ? (
                <div className="flex items-center justify-between border-t border-border px-4 py-2">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t("costs.runsPageOf", { page: page + 1, pages })}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={t("costs.runsPrev")} disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))}>
                      <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={t("costs.runsNext")} disabled={page >= pages - 1} onClick={() => setPage(Math.min(pages - 1, page + 1))}>
                      <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
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
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<RunCall[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ui = GROUP_UI[costGroupOf(run.feature)];

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && calls === null && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/ai-usage?run=${run.run_id}`);
        setCalls(res.ok ? ((await res.json()) as { calls: RunCall[] }).calls ?? [] : []);
      } catch {
        setCalls([]);
      } finally {
        setLoading(false);
      }
    }
  }, [open, calls, loading, run.run_id]);

  return (
    <li>
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <AppIcon icon={ui.icon} className={cn("size-4 shrink-0", ui.text)} strokeWidth={2} />
          <span className="min-w-0 break-words text-sm text-foreground">{featureLabel(run.feature)}</span>
          {run.model ? <ModelBadge model={run.model} size={12} className="py-0" /> : null}
          {run.calls > 1 ? (
            <Badge variant="secondary" className="h-5 shrink-0 text-[10px]">
              {t("costs.callCount", { count: run.calls })}
            </Badge>
          ) : null}
        </div>
        <span className="col-start-1 row-start-2 pl-6 text-xs tabular-nums text-muted-foreground sm:col-start-2 sm:row-start-1 sm:pl-0">
          {format.dateTime(new Date(run.first_at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="col-start-2 row-start-1 text-right text-sm font-medium tabular-nums sm:col-start-3">
          {fmtCost(run.cost)}
        </span>
      </button>
      {open ? (
        <div className="bg-muted/20 px-4 pb-3 pl-10">
          {loading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Spinner className="size-3" /> {t("costs.loadingCalls")}
            </div>
          ) : !calls || calls.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">{t("costs.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">#</th>
                    <th className="py-1 pr-3 font-medium">{t("costs.colModel")}</th>
                    <th className="py-1 pr-3 text-right font-medium">{t("costs.colPrompt")}</th>
                    <th className="py-1 pr-3 text-right font-medium">{t("costs.colCompletion")}</th>
                    <th className="py-1 text-right font-medium">{t("costs.colCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-t border-border/50">
                      <td className="py-1 pr-3 tabular-nums text-muted-foreground">{c.seq + 1}</td>
                      <td className="py-1 pr-3">
                        {c.model ? <ModelBadge model={c.model} size={12} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">{fmtInt(c.prompt_tokens)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">{fmtInt(c.completion_tokens)}</td>
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
      ) : null}
    </li>
  );
}
