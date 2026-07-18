import "server-only";

import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUserUsage } from "@/lib/server/usage";
import { userHasByokKey } from "./model";

/**
 * Contrôle d'accès de l'agent de code (MIN-46 / MIN-10, refondu par MIN-72) :
 *  1. le PLAN doit inclure les agents (`allowAgents` — Free : non), BYOK ou pas.
 *  2. BYOK présente → usage LLM ILLIMITÉ (à ses frais). Le compute sandbox
 *     reste métré au ledger (`sandbox_compute`) mais ne bloque pas le lancement.
 *  3. sinon → budget d'usage mensuel du plan (USD au coût brut, TOUTES features
 *     confondues — l'ancien plafond `agent_monthly_cap_usd` est remplacé).
 *
 * La fenêtre comptée vient de lib/server/usage.ts : période Stripe courante ou
 * mois calendaire, bornée par le filigrane admin `agent_quota_resets`.
 */

export interface AgentQuota {
  allowed: boolean;
  unlimited: boolean;
  mode: "platform" | "byok";
  spent?: number;
  cap?: number;
  remaining?: number;
  reason?: "agents_not_in_plan" | "usage_budget_exceeded";
}

/** Décide si l'utilisateur peut lancer un run maintenant. */
export async function checkAgentQuota(userId: string): Promise<AgentQuota> {
  const { plan } = await getResolvedBilling(userId);
  if (!plan.allowAgents) {
    return {
      allowed: false,
      unlimited: false,
      mode: "platform",
      reason: "agents_not_in_plan",
    };
  }

  if (await userHasByokKey(userId)) {
    return { allowed: true, unlimited: true, mode: "byok" };
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
    ...(allowed ? {} : { reason: "usage_budget_exceeded" as const }),
  };
}
