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
 *    `ai_usage.cost` (feature 'agent_code') sur la fenêtre courante.
 *
 * La fenêtre part du 1er du mois, SAUF si un admin a remis le quota de
 * l'utilisateur à zéro (`agent_quota_resets.reset_at`) : on ne compte alors que
 * depuis ce filigrane. Aucune ligne d'`ai_usage` n'est jamais supprimée — la
 * dépense réelle reste entière pour les analyses de coût.
 */

export interface AgentQuota {
  allowed: boolean;
  unlimited: boolean;
  mode: "platform" | "byok";
  spent?: number;
  cap?: number;
  remaining?: number;
}

/** Début de la fenêtre du mois courant (UTC). */
function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Début de la fenêtre COMPTÉE par le quota : le 1er du mois, ou la remise à zéro
 * admin si elle est plus récente. Un filigrane plus vieux que le mois courant n'a
 * plus d'effet (le mois a tourné, la fenêtre s'est réinitialisée d'elle-même).
 */
async function quotaWindowStart(userId: string): Promise<string> {
  const monthStart = monthStartIso();
  const service = getServiceClient();
  const { data } = await service
    .from("agent_quota_resets")
    .select("reset_at")
    .eq("user_id", userId)
    .maybeSingle();
  const resetAt = (data as { reset_at?: string } | null)?.reset_at;
  return resetAt && resetAt > monthStart ? resetAt : monthStart;
}

/** Somme des coûts agent de l'utilisateur sur la fenêtre comptée par le quota. */
async function monthlyAgentSpend(userId: string): Promise<number> {
  const service = getServiceClient();
  const since = await quotaWindowStart(userId);
  const { data } = await service
    .from("ai_usage")
    .select("cost")
    .eq("user_id", userId)
    .eq("feature", "agent_code")
    .gte("created_at", since)
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
