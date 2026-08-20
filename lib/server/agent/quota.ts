import "server-only";

import { nextBillingPlanId, type BillingPlanId } from "@/lib/billing-plans";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUserUsage } from "@/lib/server/usage";
import { userHasByokKey } from "./model";
import type { AiSurface } from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Code agent access control (MIN-46 / MIN-10, recast by MIN-72):
 * 1. A validated BYOK key is unlimited: minddy neither meters its tokens nor
 *    applies a plan or compute cap.
 * 2. Without BYOK, the plan must include agents (`allowAgents`; all current
 *    plans do) and its monthly usage budget applies (USD at raw cost, ALL features
 * combined — the old `agent_monthly_cap_usd` ceiling is replaced).
 *
 * The platform-quota window comes from lib/server/usage.ts: current Stripe
 * period or calendar month, bounded by the admin watermark `agent_quota_resets`.
 *
 * ## BYOK validation (MIN-344)
 *
 * A declared key used to be enough to bypass every limit, even if it was
 * invalid. The key must instead be recognized by its provider:
 * • the key must have been RECOGNIZED by the supplier (`user_ai_keys.validated_at`,
 * set by the `byok-validate.ts` probe); `getUserByok` ignores the others,
 * so `userHasByokKey` doesn't see them either;
 */

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
  if (hasByok) return { allowed: true, unlimited: true, mode: "byok" };
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
