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
  isStripeConfigured,
  listStripeBalanceTransactions,
} from "@/lib/server/stripe";
import { fetchOpenRouterKeyStatus } from "@/lib/server/openrouter-key";
import { getLatestFxRate } from "@/lib/server/fx";
import type { AdminFinance, AdminFinanceDay } from "@/lib/types";

/**
 * Finances page (MIN-92) — the aggregation that puts COSTS and INPUTS on the same time axis.
 *
 * Two currencies, two treatments: costs arrive in USD (OpenRouter) and convert at the EUR rate day (`fx_rates`, joined on SQL side); the income
 * is already in EUR, the settlement currency of the Stripe account.
 *
 * The income comes from BALANCE TRANSACTIONS, not from the sum of the plans: it is the
 * ledger of everything that has moved, net of Stripe fees and reimbursements. The
 * theoretical MRR remains calculated separately — it says the recurrence, it does not calculate
 * the margin.
 */

/** Line types that represent a CUSTOMER money movement. */
const REVENUE_TX_TYPES = new Set([
  "charge",
  "payment",
  "refund",
  "payment_refund",
  "adjustment", // litiges / chargebacks
]);

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

async function loadBillingAccounts(): Promise<Array<Partial<BillingAccount>>> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("billing_accounts")
    .select("user_id, stripe_price_id, stripe_plan_id, stripe_subscription_status");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Partial<BillingAccount>>;
}

/** Theoretical MRR: what ACTIVE subscriptions bring in each month. */
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
    // The annual bill charges 10 months for 12: its monthly equivalent is lower
    // than the monthly price displayed (ANNUAL_FREE_MONTHS).
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
 * Projected date of reaching the ceiling, based on the last 7 days. `null`
 * when the key has no ceiling, when nothing is consumed, or when the
 * ceiling will not be reached before its monthly reset — in the latter
 * case the projection would learn nothing.
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
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = addMonths(monthStart, 1);
  const windowStart = addDays(now, -(windowDays - 1));

  // A single SQL read covers both needs: the chart window AND
  // the calendar month of the tiles, even when the window is shorter.
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
      ? // Same reduction as the costs: each collection is borne by SA
        // day, so nothing before the window (or before the start of the month, for
        // tiles) can no longer influence what is displayed.
        listStripeBalanceTransactions({
          since: addDays(now, -(costSpan - 1)),
        }).catch((err) => {
          console.error("[finance] Stripe injoignable :", (err as Error).message);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (costsRes.error) throw new Error(costsRes.error.message);
  const costDays = (costsRes.data ?? []) as CostDay[];

  // ── income: each ENTIRE collection, on the day it falls ──────────────
  // No smoothing. The graph shows the cash flow as it
  // produced — a monthly withdrawal is one bar, on the day of the withdrawal —
  // and not a reconstructed daily average. Refunds and
  // disputes follow the same rule, on the day they arise: we do not rewrite
  // never the past.
  const revenueByDay = new Map<string, number>();
  let monthNetEur = 0;
  let monthFeesEur = 0;
  let ignoredCurrency = false;

  for (const transaction of ledger?.transactions ?? []) {
    if (!REVENUE_TX_TYPES.has(transaction.type)) continue;
    if (transaction.currency !== "eur") {
      // The account settles in EUR: another currency would signal a change of
      // configuration, not a case to convert softly.
      ignoredCurrency = true;
      continue;
    }

    const netEur = transaction.net / 100;
    const at = new Date(transaction.created * 1000);

    if (at >= monthStart && at < nextMonthStart) {
      monthNetEur += netEur;
      monthFeesEur += transaction.fee / 100;
    }

    const day = isoDay(at);
    revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + netEur);
  }

  // ── the displayed series ────────────────────────── ───────────────────────────
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

  // ── tiles: REAL numbers of the month, not smoothed ───────────────────────
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
      // ⚠️ The key is in TEST mode: the API is identical in production, but the
      // amounts will only become real with the live key.
      testMode: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_"),
      truncated: ledger?.truncated ?? false,
      ignoredCurrency,
    },
    fetchedAt: new Date().toISOString(),
  };

  cache.set(windowDays, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return payload;
}
