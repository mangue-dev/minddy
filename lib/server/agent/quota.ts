import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue } from "@/lib/server/app-config";
import {
  AGENT_MONTHLY_CAP_CONFIG_KEY,
  AGENT_MONTHLY_CAP_USD_DEFAULT,
} from "@/lib/agent-models";
import { userHasByokKey } from "./model";

/**
 * Contrôle de quota de l'agent de code (MIN-46 / MIN-10).
 *  - BYOK présente → usage ILLIMITÉ (à ses frais).
 *  - sinon → plafond mensuel (USD) sur la clé plateforme, calculé par somme de
 *    `ai_usage.cost` (feature 'agent_code') sur le mois courant.
 */

export interface AgentQuota {
  allowed: boolean;
  unlimited: boolean;
  mode: "platform" | "byok";
  spent?: number;
  cap?: number;
  remaining?: number;
}

/** Somme des coûts agent de l'utilisateur depuis le début du mois courant (UTC). */
async function monthlyAgentSpend(userId: string): Promise<number> {
  const service = getServiceClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data } = await service
    .from("ai_usage")
    .select("cost")
    .eq("user_id", userId)
    .eq("feature", "agent_code")
    .gte("created_at", monthStart)
    .limit(10000);
  let sum = 0;
  for (const row of (data ?? []) as Array<{ cost: number | null }>) sum += row.cost ?? 0;
  return sum;
}

async function getMonthlyCap(): Promise<number> {
  const raw = await getAppConfigValue(AGENT_MONTHLY_CAP_CONFIG_KEY);
  const parsed = raw != null ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : AGENT_MONTHLY_CAP_USD_DEFAULT;
}

/** Décide si l'utilisateur peut lancer un run maintenant. */
export async function checkAgentQuota(userId: string): Promise<AgentQuota> {
  if (await userHasByokKey(userId)) {
    return { allowed: true, unlimited: true, mode: "byok" };
  }
  const [cap, spent] = await Promise.all([getMonthlyCap(), monthlyAgentSpend(userId)]);
  return {
    allowed: spent < cap,
    unlimited: false,
    mode: "platform",
    spent,
    cap,
    remaining: Math.max(0, cap - spent),
  };
}
