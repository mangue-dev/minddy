import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import {
  CHAIN_BUDGET_MARGIN,
  DEFAULT_STEP_COST_USD,
  simulateChain,
  simulatedRunModes,
  type AutomationEvent,
  type AutomationIssueFacts,
  type AutomationRule,
} from "@/lib/automations";
import type { AgentLaunchMode } from "@/lib/server/agent/launch-message";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";

/**
 * Ce qu'une chaîne va coûter (MIN-147) — l'estimation affichée AVANT de lancer,
 * et l'assiette du plafond par chaîne.
 *
 * Elle se lit dans l'historique du projet plutôt que dans une table de prix : la
 * MÉDIANE du coût des derniers runs, par intention. Une médiane parce qu'un seul
 * run parti en vrille ne doit pas déplacer l'estimation de tous les suivants.
 * Sans historique, le repli est `DEFAULT_STEP_COST_USD`.
 *
 * Elle sort en USD **et** en part du budget mensuel du plan : c'est cette
 * part-là que l'UI affiche — jamais de dollars dans l'UI.
 */

/** Runs regardés pour médianiser. Assez pour lisser, assez récent pour valoir. */
const HISTORY_RUNS = 60;

export interface ChainCostEstimate {
  /** Coût attendu du parcours complet, en USD. */
  usd: number;
  /** Sa part du budget mensuel inclus du plan, entre 0 et 1 (∞ → 0 si budget nul). */
  shareOfMonthlyBudget: number;
  /** Le plafond à poser sur la chaîne (estimation × marge). */
  budgetUsd: number;
  /** Les étapes chiffrées, dans l'ordre — de quoi les nommer à l'écran. */
  modes: (AgentLaunchMode | "custom")[];
  /** L'estimation vient-elle de l'historique du projet, ou du repli ? */
  fromHistory: boolean;
}

/** Médiane d'une série non vide. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Le mode d'une étape, ramené à l'intention persistée sur le run. */
function intentOfMode(mode: AgentLaunchMode | "custom"): AgentLaunchIntent {
  return mode === "custom" ? "custom" : mode;
}

/**
 * Coût médian par intention sur les derniers runs du projet. Les runs à coût nul
 * sont ÉCARTÉS : un run mort à l'amorçage (dépôt injoignable, quota) n'a rien
 * consommé, et le compter tirerait toutes les médianes vers zéro — c'est-à-dire
 * vers une estimation qui rassure et un plafond qui coupe.
 */
async function medianCostByIntent(
  projectId: string,
): Promise<Partial<Record<AgentLaunchIntent, number>>> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("intent, cost_usd")
    .eq("project_id", projectId)
    .not("intent", "is", null)
    .gt("cost_usd", 0)
    .order("created_at", { ascending: false })
    .limit(HISTORY_RUNS);
  const rows = (data ?? []) as Array<{ intent: AgentLaunchIntent; cost_usd: number | string }>;
  const buckets = new Map<AgentLaunchIntent, number[]>();
  for (const row of rows) {
    const cost = Number(row.cost_usd);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    const list = buckets.get(row.intent) ?? [];
    list.push(cost);
    buckets.set(row.intent, list);
  }
  const out: Partial<Record<AgentLaunchIntent, number>> = {};
  for (const [intent, values] of buckets) out[intent] = median(values);
  return out;
}

export async function estimateChainCost(params: {
  projectId: string;
  ownerId: string;
  rules: readonly AutomationRule[];
  issue: AutomationIssueFacts;
  /**
   * L'événement d'où part le parcours. À FOURNIR quand on chiffre une chaîne
   * qu'on ouvre : le défaut (« le ticket vient d'entrer dans son statut
   * actuel ») est faux au moment précis d'une transition — un ticket qui passe
   * `backlog → todo` est encore en `backlog` en base quand le crochet appelle,
   * et simuler depuis `backlog` ne joue AUCUNE étape. Le plafond tombait alors
   * à zéro, et la chaîne s'arrêtait sur « budget » avant sa première étape.
   */
  from?: AutomationEvent;
}): Promise<ChainCostEstimate> {
  const steps = simulateChain(params.rules, params.issue, {
    throughHumanStop: true,
    from: params.from,
  });
  const modes = simulatedRunModes(steps);

  const [history, billing] = await Promise.all([
    medianCostByIntent(params.projectId).catch(
      () => ({}) as Partial<Record<AgentLaunchIntent, number>>,
    ),
    getResolvedBilling(params.ownerId).catch(() => null),
  ]);

  let fromHistory = false;
  const usd = modes.reduce((sum, mode) => {
    const known = history[intentOfMode(mode)];
    if (known != null) fromHistory = true;
    return sum + (known ?? DEFAULT_STEP_COST_USD[mode]);
  }, 0);

  const included = billing?.plan.includedUsageUsd ?? 0;
  return {
    usd: Number(usd.toFixed(6)),
    shareOfMonthlyBudget: included > 0 ? usd / included : 0,
    budgetUsd: Number((usd * CHAIN_BUDGET_MARGIN).toFixed(6)),
    modes,
    fromHistory,
  };
}
