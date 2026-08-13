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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * `/admin` → onglet « Finances » (MIN-92). L'écran répond à UNE question : est-ce
 * qu'on gagne de l'argent ? D'où les deux moitiés de l'équation côte à côte —
 * ce qui rentre (Stripe, encaissé net de frais et de remboursements) et ce qui
 * sort (OpenRouter, converti au taux de chaque journée).
 *
 * Le graphique est DIVERGENT : le revenu monte au-dessus de la ligne de base, le
 * coût descend en dessous, sur UNE SEULE échelle en euros. Deux échelles
 * distinctes (un axe par série) donneraient une image de la marge purement
 * décorative — on lirait un croisement là où il n'y en a pas.
 *
 * Reprend le chrome de `/statistics` (`stats-chrome`), comme la vue d'ensemble :
 * un admin n'a pas à apprendre une deuxième grammaire visuelle.
 *
 * Accès verrouillé côté serveur par `app/(app)/admin/layout.tsx` + l'API.
 */

/**
 * Le translator du namespace `Admin`, tel que le passent les sous-composants
 * de ce fichier. Le namespace n'est pas décoratif : `ReturnType<typeof
 * useTranslations>` (sans argument) type `t` sur les 2 600 clés du catalogue,
 * et TypeScript abandonne alors sur un « type instantiation is excessively
 * deep » (TS2589) — donc plus aucune vérification sur ces appels.
 */
type AdminT = ReturnType<typeof useTranslations<"Admin">>;

const FEATURES = [
  "numo_chat",
  "numo_comment",
  "dictation",
  "transcription",
  "smart_assign",
  // Smart-fill (MIN-260) : l'autre moitié de la ligne « Automatisations » côté
  // utilisateur, mais sa propre feature ici — c'est la finance, on lit les
  // coûts un par un.
  "smart_fill",
  "feedback_classify",
  "feedback_analyze",
  // Retour dicté (board public + dashboard) : l'écoute ET le rangement par Numo
  // sous un même run, donc « coût moyen / run » = le prix d'une prise.
  "feedback_voice",
  "embedding",
  "agent_code",
  // Temps machine de la sandbox, pas un appel LLM : la colonne Tokens reste
  // vide pour ces lignes.
  "sandbox_compute",
  // Recherche web (plugin OpenRouter) : le coût inclut le forfait de recherche
  // en plus des tokens du sous-appel.
  "web_search",
  // Review d'une PR par Numo (MIN-141) : un appel, sur un modèle plus cher que
  // celui de l'agent — c'est la ligne qui répond à « combien coûte une review ? ».
  "pr_review",
  // Une ROUTINE (MIN-185) : le même moteur qu'`agent_code`/`sandbox_compute`,
  // sur ses propres lignes — c'est ici qu'on lit ce que coûte, en dollars, ce
  // qui tourne tout seul chez les comptes.
  "routine_code",
  "routine_compute",
  // Correspondance des colonnes d'un import CSV (MIN-98) : un appel par fichier.
  "import_map",
  // Découpe d'un brief en objectifs + tickets (MIN-172) : un appel par brief.
  "brief_split",
  // Démo de dictée de la landing (MIN-150) : la SEULE ligne que personne ne
  // paye — un visiteur sans compte, à qui la plateforme offre le passage. Un
  // run = une démo jouée, donc « coût moyen / run » est le prix d'un passage.
  "landing_demo",
] as const;
type Feature = (typeof FEATURES)[number];

const WINDOWS = [7, 30, 90] as const;

/**
 * Les deux pôles du graphique. Paire validée (méthode data-viz) : séparation
 * CVD ΔE 10,1 et contraste ≥ 3:1 sur fond clair ET sombre, avec les mêmes
 * teintes dans les deux modes. La position au-dessus / en dessous de la ligne
 * de base reste l'encodage principal — la couleur ne fait que confirmer.
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
   * Coût CALCULÉ, pas rapporté (MIN-216) : un essai de stream abandonné est
   * facturé sans que l'objet `usage` n'arrive jamais. Affiché « ≈ » — la marge
   * du mois ne doit pas se comparer à des dollars qu'on n'a jamais relevés.
   */
  estimated?: boolean;
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
        ? // `feature` vient de l'API : clé assemblée à l'exécution, gardée par
          // le `FEATURES.includes` juste au-dessus.
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

  /** Le bouton « Actualiser » : contourne le cache serveur et retape Stripe. */
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
    /* La largeur et les marges viennent du shell (`admin-dashboard`) : les
       onglets partagent un seul conteneur, sinon leurs contenus ne s'alignent
       pas d'un onglet à l'autre. */
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
          <MoneyTiles finance={finance} t={t} />

          <FreshnessBar
            finance={finance}
            refreshing={refreshing}
            onRefresh={refresh}
            t={t}
          />

          <StatsSection
            title={t("finance.chartTitle")}
            info={t("finance.chartInfo")}
          >
            <StatsCard className="flex flex-col gap-4">
              <MarginChart days={finance.days} t={t} />
            </StatsCard>
          </StatsSection>

          <SpendCap finance={finance} t={t} />

          <StatsSection title={t("finance.byType")}>
            <FeatureTable rows={byFeature} featureLabel={featureLabel} t={t} />
          </StatsSection>

          {/* Les runs sont une info de consultation PONCTUELLE : ils ne prennent
              plus toute la page, ils attendent qu'on les demande. */}
          <StatsSection title={t("finance.logs")}>
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

// ── les chiffres réels du mois ───────────────────────────────────────────────

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

/** Provenance et fraîcheur : le taux avec SA date, Stripe avec son horodatage. */
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
      {/* Un montant converti sans son taux n'est pas vérifiable ; la date rend
          visible un cron de change en panne. */}
      <span>
        {finance.fx
          ? t("finance.fxRate", {
              rate: finance.fx.usdEur.toFixed(5),
              date: rateDay ?? "",
            })
          : t("finance.fxMissing")}
      </span>
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

// ── le graphique divergent ───────────────────────────────────────────────────

/**
 * Une colonne par jour : le revenu monte, le coût descend, autour d'une ligne de
 * base commune. UNE échelle en euros pour les deux directions — c'est ce qui
 * rend la comparaison honnête, et donc la marge lisible.
 */
function MarginChart({
  days,
  t,
}: {
  days: AdminFinanceDay[];
  t: AdminT;
}) {
  const format = useFormatter();

  const scale = useMemo(
    () =>
      days.reduce(
        (max, day) => Math.max(max, day.revenueEur, day.costEur ?? 0),
        0,
      ),
    [days],
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
      {/* Deux séries → légende systématique : l'identité ne repose jamais sur
          la seule couleur. */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[2px]", REVENUE_COLOR)} aria-hidden />
          <span className="text-muted-foreground">{t("finance.legendRevenue")}</span>
        </span>
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
              // La cible de survol est la COLONNE entière : viser une barre de
              // 2 px un jour presque vide serait impossible.
              <Tooltip key={day.day}>
                <TooltipTrigger asChild>
                  <div className="flex min-w-[3px] flex-1 flex-col">
                    {/* 96 px par moitié, pas 56 : une bande à une seule série
                        (la vue d'ensemble) peut être basse, un graphique
                        divergent partage sa hauteur en deux et perdrait ses
                        valeurs intermédiaires — une journée à 30 % du maximum
                        doit rester une barre, pas un tiret. */}
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
                    {/* La ligne de base : le zéro est une vraie ligne, pas une
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
                  <span className="mt-1 block text-background/70">
                    {t("finance.tooltipRevenue", { amount: eur(day.revenueEur) })}
                  </span>
                  <span className="block text-background/70">
                    {t("finance.tooltipCost", { amount: eur(day.costEur) })}
                  </span>
                  <span className="block text-background/70">
                    {t("finance.tooltipMargin", { amount: eur(day.marginEur) })}
                  </span>
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

// ── garde-fou de dépense ─────────────────────────────────────────────────────

/**
 * Le plafond mensuel de la CLÉ minddy. Le saturer coupe Numo, la dictée et le
 * traitement du feedback jusqu'au mois suivant — c'est le vrai risque, pas la
 * panne de crédits (l'auto-refill OpenRouter s'en charge).
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
      <StatsSection title={t("finance.capTitle")}>
        <StatsCard>
          <p className="text-sm text-muted-foreground">{t("finance.capUnavailable")}</p>
        </StatsCard>
      </StatsSection>
    );
  }

  const percent = cap.percent ?? 0;
  // 90 % est le seuil qui déclenche la notification push (cron spend-guard) :
  // la barre change de couleur au même endroit, pour que l'écran et l'alerte
  // racontent la même histoire.
  const alerting = percent >= 90;

  return (
    <StatsSection title={t("finance.capTitle")} info={t("finance.capInfo")}>
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
    /* `bg-card` comme les autres sections : sans lui le tableau laissait voir le
       fond de page et flottait à côté des cartes voisines. Pas de `StatsCard`
       ici — sa marge intérieure décollerait le tableau de sa bordure. */
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

// ── les logs, rangés ─────────────────────────────────────────────────────────

/** Accordéon replié par défaut, sur le patron de `usage-history-section`. */
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
                      {/* Le modèle se lit par sa marque, pas par son slug
                          OpenRouter : logo + nom formaté, l'id brut au survol. */}
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
