import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  annualMonthlyEquivalentEur,
  getBillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";
import {
  resolvePaidPlanFromBillingAccount,
  type BillingAccount,
} from "@/lib/server/billing-accounts";
import {
  balanceTransactionCustomerId,
  isStripeConfigured,
  listStripeBalanceTransactions,
  getIntervalForStripePrice,
  type StripeBalanceTransaction,
} from "@/lib/server/stripe";
import { fetchOpenRouterKeyStatus } from "@/lib/server/openrouter-key";
import { getLatestFxRate } from "@/lib/server/fx";
import type { AdminFinance, AdminFinanceDay } from "@/lib/types";

/**
 * Page Finances (MIN-92) — l'agrégation qui met les COÛTS et les ENTRÉES sur le
 * même axe de temps.
 *
 * Deux devises, deux traitements : les coûts arrivent en USD (OpenRouter) et se
 * convertissent au taux de LEUR journée (`fx_rates`, joint côté SQL) ; le revenu
 * est déjà en EUR, devise de règlement du compte Stripe.
 *
 * Le revenu vient des BALANCE TRANSACTIONS, pas de la somme des plans : c'est le
 * ledger de tout ce qui a bougé, net des frais Stripe et des remboursements. Le
 * MRR théorique reste calculé à part — il dit la récurrence, il ne calcule pas
 * la marge.
 */

/** Types de lignes qui représentent un mouvement d'argent CLIENT. */
const REVENUE_TX_TYPES = new Set([
  "charge",
  "payment",
  "refund",
  "payment_refund",
  "adjustment", // litiges / chargebacks
]);

/** Une charge n'est jamais étalée : c'est un service rendu sur une PÉRIODE. */
const SPREAD_TX_TYPES = new Set(["charge", "payment"]);

/**
 * Recul de lecture du ledger. Un abonnement annuel encaissé il y a onze mois
 * verse encore sa part quotidienne dans la fenêtre affichée : sans ce recul, la
 * courbe montrerait du revenu à zéro pour un client bien actif.
 */
const LEDGER_LOOKBACK_DAYS = 400;

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  payload: AdminFinance;
  expiresAt: number;
}
const cache = new Map<number, CacheEntry>();

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface CostDay {
  day: string;
  cost_usd: number | string;
  cost_eur: number | string | null;
  usd_eur: number | string | null;
  calls: number;
  runs: number;
}

/**
 * Étale un encaissement sur sa période de service. Un prélèvement mensuel posé
 * en une barre le jour du débit serait illisible à côté d'un coût quotidien :
 * sur la courbe, on répartit. Les tuiles du haut, elles, portent les chiffres
 * réels non lissés.
 */
function spreadCharge(
  chargedAt: Date,
  interval: "month" | "year"
): { start: Date; days: number } {
  const end = interval === "year" ? addMonths(chargedAt, 12) : addMonths(chargedAt, 1);
  const days = Math.max(
    1,
    Math.round((end.getTime() - chargedAt.getTime()) / 86_400_000)
  );
  return { start: chargedAt, days };
}

/**
 * La cadence facturée à ce client. On la lit sur le compte minddy correspondant
 * (`stripe_customer_id` → `stripe_price_id`), ce que `expand[]=data.source`
 * rend possible sans un seul appel Stripe de plus. Client inconnu → mensuel,
 * l'hypothèse la plus courante.
 */
function intervalForTransaction(
  transaction: StripeBalanceTransaction,
  priceByCustomer: Map<string, string | null>
): "month" | "year" {
  const customerId = balanceTransactionCustomerId(transaction);
  if (!customerId) return "month";
  const priceId = priceByCustomer.get(customerId);
  return getIntervalForStripePrice(priceId) === "year" ? "year" : "month";
}

async function loadBillingAccounts(): Promise<Array<Partial<BillingAccount>>> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("billing_accounts")
    .select(
      "user_id, stripe_customer_id, stripe_price_id, stripe_plan_id, stripe_subscription_status"
    );
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Partial<BillingAccount>>;
}

/** MRR théorique : ce que les abonnements ACTIFS rapportent chaque mois. */
function computeMrr(accounts: Array<Partial<BillingAccount>>): {
  mrrEur: number;
  payingAccounts: number;
  byPlan: Array<{ planId: BillingPlanId; count: number; mrrEur: number }>;
} {
  const perPlan = new Map<BillingPlanId, { count: number; mrrEur: number }>();
  let mrrEur = 0;
  let payingAccounts = 0;

  for (const account of accounts) {
    const paid = resolvePaidPlanFromBillingAccount(account as BillingAccount);
    if (!paid) continue;
    const plan = getBillingPlan(paid.planId);
    // L'annuel facture 10 mois pour 12 : son équivalent mensuel est plus bas
    // que le prix mensuel affiché (ANNUAL_FREE_MONTHS).
    const monthly =
      paid.interval === "year"
        ? annualMonthlyEquivalentEur(plan)
        : plan.priceEurMonthly;
    mrrEur += monthly;
    payingAccounts++;
    const entry = perPlan.get(paid.planId) ?? { count: 0, mrrEur: 0 };
    entry.count++;
    entry.mrrEur += monthly;
    perPlan.set(paid.planId, entry);
  }

  return {
    mrrEur: round2(mrrEur),
    payingAccounts,
    byPlan: [...perPlan.entries()].map(([planId, value]) => ({
      planId,
      count: value.count,
      mrrEur: round2(value.mrrEur),
    })),
  };
}

/**
 * Date projetée d'atteinte du plafond, au rythme des 7 derniers jours. `null`
 * quand la clé n'a pas de plafond, quand rien n'est consommé, ou quand le
 * plafond ne sera pas atteint avant sa remise à zéro mensuelle — dans ce dernier
 * cas la projection n'apprendrait rien.
 */
function projectExhaustion(
  remaining: number | null,
  weeklyUsage: number,
  resetDay: Date
): string | null {
  if (remaining === null || remaining <= 0) return null;
  const daily = weeklyUsage / 7;
  if (daily <= 0) return null;
  const projected = addDays(new Date(), Math.ceil(remaining / daily));
  return projected >= resetDay ? null : isoDay(projected);
}

export async function getFinanceSummary(options: {
  days: number;
  refresh?: boolean;
}): Promise<AdminFinance> {
  const windowDays = Math.max(1, Math.min(365, options.days));

  if (!options.refresh) {
    const cached = cache.get(windowDays);
    if (cached && cached.expiresAt > Date.now()) return cached.payload;
  }

  const now = new Date();
  const today = isoDay(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = addMonths(monthStart, 1);
  const windowStart = addDays(now, -(windowDays - 1));

  // Une seule lecture SQL couvre les deux besoins : la fenêtre du graphique ET
  // le mois calendaire des tuiles, même quand la fenêtre est plus courte.
  const costSpan = Math.max(
    windowDays,
    Math.ceil((now.getTime() - monthStart.getTime()) / 86_400_000) + 1
  );

  const service = getServiceClient();
  const [costsRes, accounts, keyStatus, fx, ledger] = await Promise.all([
    service.rpc("get_ai_cost_daily", { p_days: costSpan, p_tz: "UTC" }),
    loadBillingAccounts(),
    fetchOpenRouterKeyStatus(),
    getLatestFxRate(),
    isStripeConfigured()
      ? listStripeBalanceTransactions({
          since: addDays(now, -LEDGER_LOOKBACK_DAYS),
        }).catch((err) => {
          console.error("[finance] Stripe injoignable :", (err as Error).message);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (costsRes.error) throw new Error(costsRes.error.message);
  const costDays = (costsRes.data ?? []) as CostDay[];

  // ── revenu, étalé au prorata sur la courbe ────────────────────────────────
  const priceByCustomer = new Map<string, string | null>();
  for (const account of accounts) {
    if (account.stripe_customer_id) {
      priceByCustomer.set(account.stripe_customer_id, account.stripe_price_id ?? null);
    }
  }

  const revenueByDay = new Map<string, number>();
  let monthNetEur = 0;
  let monthFeesEur = 0;
  let ignoredCurrency = false;

  for (const transaction of ledger?.transactions ?? []) {
    if (!REVENUE_TX_TYPES.has(transaction.type)) continue;
    if (transaction.currency !== "eur") {
      // Le compte règle en EUR : une autre devise signalerait un changement de
      // configuration, pas un cas à convertir en douce.
      ignoredCurrency = true;
      continue;
    }

    const netEur = transaction.net / 100;
    const at = new Date(transaction.created * 1000);

    if (at >= monthStart && at < nextMonthStart) {
      monthNetEur += netEur;
      monthFeesEur += transaction.fee / 100;
    }

    if (!SPREAD_TX_TYPES.has(transaction.type)) {
      // Remboursements et litiges tombent au jour où ils surviennent : on ne
      // réécrit pas le passé.
      const day = isoDay(at);
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + netEur);
      continue;
    }

    const { start, days } = spreadCharge(
      at,
      intervalForTransaction(transaction, priceByCustomer)
    );
    const perDay = netEur / days;
    for (let offset = 0; offset < days; offset++) {
      const day = isoDay(addDays(start, offset));
      if (day > today) break;
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + perDay);
    }
  }

  // ── la série affichée ─────────────────────────────────────────────────────
  const windowStartDay = isoDay(windowStart);
  const days: AdminFinanceDay[] = costDays
    .filter((row) => row.day >= windowStartDay)
    .map((row) => {
      const costEur = row.cost_eur === null ? null : Number(row.cost_eur);
      const revenueEur = round2(revenueByDay.get(row.day) ?? 0);
      return {
        day: row.day,
        costUsd: Number(row.cost_usd),
        costEur: costEur === null ? null : round2(costEur),
        revenueEur,
        marginEur: costEur === null ? null : round2(revenueEur - costEur),
        usdEur: row.usd_eur === null ? null : Number(row.usd_eur),
        calls: Number(row.calls),
        runs: Number(row.runs),
      };
    });

  // ── les tuiles : chiffres RÉELS du mois, non lissés ───────────────────────
  const monthStartDay = isoDay(monthStart);
  const monthCosts = costDays.filter((row) => row.day >= monthStartDay);
  const monthCostUsd = monthCosts.reduce((sum, row) => sum + Number(row.cost_usd), 0);
  const monthCostEur = monthCosts.some((row) => row.cost_eur === null)
    ? null
    : monthCosts.reduce((sum, row) => sum + Number(row.cost_eur), 0);

  const { mrrEur, payingAccounts, byPlan } = computeMrr(accounts);

  const payload: AdminFinance = {
    windowDays,
    days,
    month: {
      netCollectedEur: round2(monthNetEur),
      stripeFeesEur: round2(monthFeesEur),
      costUsd: round2(monthCostUsd),
      costEur: monthCostEur === null ? null : round2(monthCostEur),
      marginEur:
        monthCostEur === null ? null : round2(monthNetEur - monthCostEur),
    },
    mrrEur,
    payingAccounts,
    byPlan,
    fx: fx ? { day: fx.day, usdEur: fx.usdEur } : null,
    cap: keyStatus
      ? {
          limitUsd: keyStatus.limit,
          usageUsd: round2(keyStatus.usage),
          remainingUsd:
            keyStatus.remaining === null ? null : round2(keyStatus.remaining),
          percent:
            keyStatus.limit && keyStatus.limit > 0
              ? Math.round((keyStatus.usage / keyStatus.limit) * 100)
              : null,
          resetDay: isoDay(nextMonthStart),
          projectedExhaustionDay: projectExhaustion(
            keyStatus.remaining,
            keyStatus.usageWeekly,
            nextMonthStart
          ),
        }
      : null,
    stripe: {
      configured: isStripeConfigured(),
      reachable: ledger !== null,
      // ⚠️ La clé est en mode TEST : l'API est identique en production, mais les
      // montants ne deviendront réels qu'avec la clé live.
      testMode: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"),
      truncated: ledger?.truncated ?? false,
      ignoredCurrency,
    },
    fetchedAt: new Date().toISOString(),
  };

  cache.set(windowDays, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return payload;
}
