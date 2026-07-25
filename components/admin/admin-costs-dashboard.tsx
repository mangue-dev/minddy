"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Separator, Skeleton, Spinner } from "mangue-ui";

/**
 * Dashboard admin du suivi des coûts LLM (`/admin` → onglet « Coûts IA »).
 * Lit `/api/admin/ai-usage` (agrégats SQL) : totaux, breakdown par TYPE d'IA
 * (avec moyenne par run et par appel) et liste des runs récents — chaque run se
 * déplie pour montrer ses appels individuels (« regroupés mais visibles un à un »).
 * Accès verrouillé côté serveur par `app/(app)/admin/layout.tsx` + l'API.
 */

const FEATURES = [
  "numo_chat",
  "numo_comment",
  "dictation",
  "transcription",
  "smart_assign",
  "feedback_classify",
  "feedback_analyze",
  "embedding",
  "agent_code",
  // Temps machine de la sandbox, pas un appel LLM : la colonne Tokens reste
  // vide pour ces lignes.
  "sandbox_compute",
] as const;
type Feature = (typeof FEATURES)[number];

const WINDOWS = [7, 30, 90] as const;

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
  created_at: string;
}

/** Coût USD : beaucoup d'appels valent une fraction de centime → précision élevée. */
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

export function AdminCostsDashboard() {
  const t = useTranslations("Admin");
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const featureLabel = useCallback(
    (feature: string) =>
      FEATURES.includes(feature as Feature)
        ? t(`costs.features.${feature}`)
        : feature,
    [t]
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/ai-usage?days=${days}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { stats: Stats };
        if (alive) setStats(data.stats);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [days]);

  const byFeature = useMemo(
    () => [...(stats?.by_feature ?? [])].sort((a, b) => b.cost - a.cost),
    [stats]
  );

  return (
    <div className="mx-auto max-w-[880px] space-y-8 p-4 md:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("costs.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("costs.subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted p-[3px]">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === w
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("costs.window", { days: w })}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {t("costs.loadError")}
        </div>
      ) : loading || !stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-10">
          <TotalsCards totals={stats.totals} t={t} />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("costs.byType")}</h2>
            <FeatureTable rows={byFeature} featureLabel={featureLabel} t={t} />
          </section>

          <Separator />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t("costs.recentRuns")}</h2>
            <p className="text-xs text-muted-foreground">{t("costs.recentRunsHint")}</p>
            <RunsList runs={stats.recent_runs} featureLabel={featureLabel} t={t} />
          </section>
        </div>
      )}
    </div>
  );
}

function TotalsCards({
  totals,
  t,
}: {
  totals: Totals;
  t: ReturnType<typeof useTranslations>;
}) {
  const cards = [
    { label: t("costs.totalCost"), value: fmtCost(totals.cost), accent: true },
    { label: t("costs.totalRuns"), value: fmtInt(totals.runs) },
    { label: t("costs.totalCalls"), value: fmtInt(totals.calls) },
    { label: t("costs.totalTokens"), value: fmtInt(totals.tokens) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border bg-card p-4"
        >
          <div className="text-xs text-muted-foreground">{c.label}</div>
          <div
            className={`mt-1 font-display text-xl font-semibold tabular-nums ${
              c.accent ? "text-foreground" : ""
            }`}
          >
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeatureTable({
  rows,
  featureLabel,
  t,
}: {
  rows: FeatureRow[];
  featureLabel: (f: string) => string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        {t("costs.empty")}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t("costs.colType")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("costs.colCost")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("costs.colRuns")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("costs.colCalls")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("costs.colAvgRun")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("costs.colAvgCall")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("costs.colTokens")}</th>
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

function RunsList({
  runs,
  featureLabel,
  t,
}: {
  runs: RunRow[];
  featureLabel: (f: string) => string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (runs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        {t("costs.empty")}
      </p>
    );
  }
  return (
    <div className="divide-y rounded-xl border">
      {runs.map((run) => (
        <RunRowItem key={run.run_id} run={run} featureLabel={featureLabel} t={t} />
      ))}
    </div>
  );
}

function RunRowItem({
  run,
  featureLabel,
  t,
}: {
  run: RunRow;
  featureLabel: (f: string) => string;
  t: ReturnType<typeof useTranslations>;
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
          className={`text-xs text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        >
          ▶
        </span>
        <span className="font-medium">{featureLabel(run.feature)}</span>
        {run.calls > 1 && (
          <Badge variant="secondary" className="shrink-0">
            {t("costs.callCount", { count: run.calls })}
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
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("costs.colPrompt")}
                    </th>
                    <th className="py-1 pr-3 text-right font-medium">
                      {t("costs.colCompletion")}
                    </th>
                    <th className="py-1 text-right font-medium">{t("costs.colCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-t border-border/50">
                      <td className="py-1 pr-3 tabular-nums text-muted-foreground">
                        {c.seq + 1}
                      </td>
                      <td className="py-1 pr-3 font-mono text-[11px]">
                        {c.model ?? "—"}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                        {fmtInt(c.prompt_tokens)}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                        {fmtInt(c.completion_tokens)}
                      </td>
                      <td className="py-1 text-right tabular-nums">{fmtCost(c.cost)}</td>
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
