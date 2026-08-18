import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  SANDBOX_USD_PER_MINUTE,
  USAGE_SEGMENTS,
  type BillableFeature,
  type UsageSegmentId,
} from "@/lib/billing-plans";
import {
  getResolvedBilling,
  shouldUseStripePlan,
  type ResolvedBilling,
} from "@/lib/server/billing-accounts";
import { resolveUsageWindow } from "@/lib/billing-cycle";
import { PlanLimitError } from "@/lib/server/plan-limit-error";
import {
  recordAiUsage,
  type AiFeature,
  type AiUsageBillTo,
} from "@/lib/server/ai-usage";
import type { AiSurface } from "@/lib/ai-surfaces";
import { usesByokForSurface } from "@/lib/server/ai-runtime";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Usage budget (MIN-72) — the amount spent by a user in the current window,
 * aggregated from the ledger `ai_usage` (gross cost USD, broken down by feature).
 *
 * Window: the Stripe billing cycle for subscribers (annual → subcycle
 * MONTHLY, usage resets each month even in annual payment), otherwise
 * the calendar month UTC; bounded by the watermark `agent_quota_resets` (reset
 * to zero admin — applies to the entire budget, not just agents). This
 * watermark is a REGISTER: several resets can coexist over the same period, and it is the MOST RECENT one which limits the window.
 *
 * Enforcement: `ensureUsageBudget` in PRE-FLIGHT before each costing action ;
 * the recording remains post-hoc best-effort (`recordAiUsage` never throw
 *) — a slight overrun on the last action is assumed, as in
 * Claude/ChatGPT. No 5 h/week window in v1 (session rate limits
 * remain anti-burst guard).
 */

export interface UsagePeriod {
  start: string;
  end: string;
}

export interface UserUsage {
  billing: ResolvedBilling;
  period: UsagePeriod;
  usedUsd: number;
  byFeature: Partial<Record<BillableFeature, number>>;
}

function monthWindow(now = new Date()): UsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * The BILLING PERIOD of this user, before any watermark - it is this which
 * limits the register of resets ("how many have we already offered on
 * this period?"), where `getUsagePeriod` responds to "since when have we counted
 *really? ".
 *
 * Stripe cycle as soon as an ACTIVE subscription has its dates, independently of the
 * source of the effective plan: an admin override can coexist with a real
 * subscription, and it is then the cycle (not the calendar month) which limits
 * usage. Annual → MONTHLY subcycle: usage resets each month
 * even when payment is annual.
 */
export function getBillingWindow(billing: ResolvedBilling): UsagePeriod {
  const account = billing.account;
  if (
    account?.stripe_current_period_start &&
    account.stripe_current_period_end &&
    shouldUseStripePlan(account.stripe_subscription_status)
  ) {
    const window = resolveUsageWindow({
      periodStart: account.stripe_current_period_start,
      periodEnd: account.stripe_current_period_end,
    });
    if (window) return window;
  }
  return monthWindow();
}

/**
 * The last watermark placed on this account.
 *
 * `agent_quota_resets` is a REGISTER: an admin can place several on
 * the same period, and it is the MOST RECENT reset which sets the start
 * of the window counted — the previous ones are already behind it, they can no longer release anything.
 */
export async function latestQuotaResetAt(userId: string): Promise<string | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_quota_resets")
    .select("reset_at")
    .eq("user_id", userId)
    .order("reset_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { reset_at?: string } | null)?.reset_at ?? null;
}

/** The window counted by this user's budget. */
export async function getUsagePeriod(
  userId: string,
  billing: ResolvedBilling
): Promise<UsagePeriod> {
  const { start, end } = getBillingWindow(billing);
  const resetAt = await latestQuotaResetAt(userId);
  return { start: resetAt && resetAt > start ? resetAt : start, end };
}

interface UsageRpcRow {
  feature: string;
  cost: number | string;
  calls: number;
  runs: number;
}

function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Spent + breakdown by user feature on their current window. */
export async function getUserUsage(userId: string): Promise<UserUsage> {
  const billing = await getResolvedBilling(userId);
  const period = await getUsagePeriod(userId, billing);

  const service = getServiceClient();
  const { data, error } = await service.rpc("get_user_usage_since", {
    p_user_id: userId,
    p_since: period.start,
  });
  if (error) throw new Error(error.message);

  const parsed = (data ?? {}) as {
    total_cost?: number | string;
    by_feature?: UsageRpcRow[];
  };
  const byFeature: Partial<Record<BillableFeature, number>> = {};
  for (const row of parsed.by_feature ?? []) {
    byFeature[row.feature as BillableFeature] = roundUsd(Number(row.cost) || 0);
  }

  return {
    billing,
    period,
    usedUsd: roundUsd(Number(parsed.total_cost) || 0),
    byFeature,
  };
}

/** Breaks `byFeature` across the display segments, in bar order. */
export function segmentizeUsage(
  byFeature: Partial<Record<BillableFeature, number>>
): Array<{ id: UsageSegmentId; usd: number }> {
  return USAGE_SEGMENTS.map((segment) => ({
    id: segment.id,
    usd: roundUsd(
      segment.features.reduce((sum, feature) => sum + (byFeature[feature] ?? 0), 0)
    ),
  }));
}

/**
 * Pre-flight check: remaining budget → current usage; exhausted → 403
 * `usage_budget_exceeded`. Returns usage to avoid a second fetch.
 */
export async function ensureUsageBudget(
  userId: string,
  surface?: AiSurface,
): Promise<UserUsage> {
  const usage = await getUserUsage(userId);
  if (!isManagedAiEnabled()) return usage;
  if (surface && (await usesByokForSurface(userId, surface))) return usage;
  const included = usage.billing.plan.includedUsageUsd;
  if (usage.usedUsd >= included) {
    throw new PlanLimitError("usage_budget_exceeded", {
      used: roundUsd(usage.usedUsd),
      included,
    });
  }
  return usage;
}

/** Boolean variant for background jobs (cron feedback, smart assign). */
export async function hasUsageBudget(userId: string, surface?: AiSurface): Promise<boolean> {
  try {
    if (!isManagedAiEnabled()) return true;
    if (surface && (await usesByokForSurface(userId, surface))) return true;
    const usage = await getUserUsage(userId);
    return usage.usedUsd < usage.billing.plan.includedUsageUsd;
  } catch (err) {
    // Best-effort: a read failure should not shut down background jobs.
    console.error("[usage] budget check failed:", (err as Error).message);
    return true;
  }
}

/**
 * Budget of the OWNER of a project — for the feedback board AI (cron, posts
 * public): it is the owner who pays, not the visitor. Best-effort (true if
 * the project is not found): never break a public flow on a doubt.
 */
export async function ownerHasUsageBudget(
  projectId: string,
  surface?: AiSurface,
): Promise<boolean> {
  try {
    const service = getServiceClient();
    const { data } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    const ownerId = (data as { owner_id?: string } | null)?.owner_id;
    if (!ownerId) return true;
    return await hasUsageBudget(ownerId, surface);
  } catch (err) {
    console.error("[usage] owner budget check failed:", (err as Error).message);
    return true;
  }
}

/**
 * Vercel Sandbox compute metering of a run agent: wall-clock × $/min, one
 * line in the ledger (provider 'vercel'). `seq` must be unique in the calling side
 * run (one line per drain slice).
 *
 * `feature` distinguishes the microVM of an agent run (`sandbox_compute`, the
 * default) from that of a run pass. ROUTINE (`routine_compute`, MIN-185) — the
 * two halves of a routine expense, tokens and minutes, fit under the
 * same segment or the separation means nothing.
 */
export async function recordSandboxUsage(params: {
  runId: string;
  seq: number;
  billTo: AiUsageBillTo;
  feature?: Extract<AiFeature, "sandbox_compute" | "routine_compute">;
  projectId: string | null;
  durationMs: number;
}): Promise<void> {
  const minutes = params.durationMs / 60_000;
  const cost = roundUsd(minutes * SANDBOX_USD_PER_MINUTE);
  if (cost <= 0) return;
  await recordAiUsage({
    runId: params.runId,
    seq: params.seq,
    feature: params.feature ?? "sandbox_compute",
    provider: "vercel",
    model: "vercel/sandbox",
    cost,
    billTo: params.billTo,
    projectId: params.projectId,
  });
}
