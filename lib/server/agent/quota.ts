import "server-only";

import { nextBillingPlanId, type BillingPlanId } from "@/lib/billing-plans";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUserUsage } from "@/lib/server/usage";
import { userHasByokKey } from "./model";
import type { AiSurface } from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Code agent access control (MIN-46 / MIN-10, recast by MIN-72):
 * 1. the PLAN must include agents (`allowAgents` — Free: no), BYOK or not.
 * 2. BYOK VALIDATED → LLM usage UNLIMITED (at its own expense), BUT the compute of the
 * microVM keeps its ceiling (see below).
 * 3. otherwise → monthly usage budget of the plan (USD at raw cost, ALL features
 * combined — the old `agent_monthly_cap_usd` ceiling is replaced).
 *
 * The counted window comes from lib/server/usage.ts: current Stripe period or
 * calendar month, bounded by the admin watermark `agent_quota_resets`.
 *
 * ## What BYOK raises, and what it does not raise (MIN-344)
 *
 * It raised EVERYTHING, and it was enough to declare a key - even an invented one - for that.
 * Two corrections, in two places:
 * • the key must have been RECOGNIZED by the supplier (`user_ai_keys.validated_at`,
 * set by the `byok-validate.ts` probe); `getUserByok` ignores the others,
 * so `userHasByokKey` doesn't see them either;
 * • the compute sandbox NEVER rises. The tokens are paid by the key of
 * the user, the microVM is not: it runs on the Vercel account of
 * minddy, at the minute (`SANDBOX_USD_PER_MINUTE`). A personal key cannot therefore
 * open an unlimited compute tap — it was the only ceiling that
 * protected an expense that remains ours.
 *
 * The compute ceiling is the usage budget of the plan, read on the sole lines
 * of microVM (`sandbox_compute` + `routine_compute`). In other words: a BYOK account
 * is entitled to as many minutes of microVM as a platform account
 * could afford by spending its entire budget - and its own tokens, en
 * more, without limit. It's broad, and it's limited.
 */

/** Ledger lines measuring MICROVM MINUTES, paid by minddy. */
const COMPUTE_FEATURES = ["sandbox_compute", "routine_compute"] as const;

export interface AgentQuota {
  allowed: boolean;
  unlimited: boolean;
  mode: "platform" | "byok";
  spent?: number;
  cap?: number;
  remaining?: number;
  /** ISO — end of window counted: the date the budget recharges. */
  resetsAt?: string;
  /** Current plan, and the next one if there is one above (upgrade proposal). */
  planId?: BillingPlanId;
  nextPlanId?: BillingPlanId | null;
  reason?: "agents_not_in_plan" | "usage_budget_exceeded" | "managed_ai_unavailable";
}

/** Decide if the user can start a run now. */
export async function checkAgentQuota(
  userId: string,
  surface: Extract<AiSurface, "agent" | "automations"> = "agent",
): Promise<AgentQuota> {
  const hasByok = await userHasByokKey(userId, surface);
  // In self-hosting, the tokens and the endpoint belong to the operator.
  // A BYOK key (or a local endpoint) is therefore authorized without reading a plan or
  // from ledger minddy ; without it, we refuse any platform call beforehand.
  if (!isManagedAiEnabled()) {
    return hasByok
      ? { allowed: true, unlimited: true, mode: "byok" }
      : { allowed: false, unlimited: false, mode: "platform", reason: "managed_ai_unavailable" };
  }

  const { plan } = await getResolvedBilling(userId);
  if (!plan.allowAgents) {
    return {
      allowed: false,
      unlimited: false,
      mode: "platform",
      planId: plan.id,
      nextPlanId: nextBillingPlanId(plan.id),
      reason: "agents_not_in_plan",
    };
  }

  if (hasByok) {
    const usage = await getUserUsage(userId);
    const cap = plan.includedUsageUsd;
    // The TWO features of microVM: an agent run and a routine pass
    // burn the same minutes on the same Vercel account, only the line of
    // invoice differs. Counting them separately would leave half the tap
    // ouverte.
    const compute = COMPUTE_FEATURES.reduce(
      (sum, feature) => sum + (usage.byFeature[feature] ?? 0),
      0,
    );
    const allowed = compute < cap;
    return {
      allowed,
      unlimited: true,
      mode: "byok",
      planId: plan.id,
      spent: compute,
      cap,
      remaining: Math.max(0, cap - compute),
      resetsAt: usage.period.end,
      ...(allowed ? {} : { reason: "usage_budget_exceeded" as const }),
    };
  }

  const usage = await getUserUsage(userId);
  const cap = plan.includedUsageUsd;
  const spent = usage.usedUsd;
  const allowed = spent < cap;
  return {
    allowed,
    unlimited: false,
    mode: "platform",
    spent,
    cap,
    remaining: Math.max(0, cap - spent),
    resetsAt: usage.period.end,
    planId: plan.id,
    nextPlanId: nextBillingPlanId(plan.id),
    ...(allowed ? {} : { reason: "usage_budget_exceeded" as const }),
  };
}
