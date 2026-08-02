import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import {
  DEFAULT_STEP_COST_USD,
  effortCostFactor,
  simulateChain,
  simulatedRunModes,
  type AutomationEvent,
  type AutomationIssueFacts,
  type AutomationRule,
} from "@/lib/automations";
import type { IssueEffort } from "@/lib/issue-constants";
import type { AgentLaunchMode } from "@/lib/server/agent/launch-message";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";

/**
 * Ce qu'une chaîne va coûter (MIN-147) — un AFFICHAGE, et rien d'autre : rien ne
 * s'interrompt dessus (cf. l'en-tête de lib/automations sur l'absence de plafond
 * par chaîne). Elle sert à répondre « est-ce que ça va me coûter cher ? » avant
 * d'armer la boucle, pas à la couper une fois lancée.
 *
 * Elle se lit dans l'historique du projet plutôt que dans une table de prix : la
 * MÉDIANE du coût des derniers runs, par intention. Une médiane parce qu'un seul
 * run parti en vrille ne doit pas déplacer l'estimation de tous les suivants.
 * Sans historique, le repli est `DEFAULT_STEP_COST_USD`.
 *
 * Deux dimensions, pas une : ce que le run FAIT (planifier, coder, vérifier) et
 * la TAILLE du ticket. Les runs de l'historique sont donc ramenés à leur
 * équivalent-M (`effortCostFactor`) avant d'être médianisés, puis la médiane est
 * remise à l'échelle du ticket qu'on estime. Sans cette normalisation, un projet
 * qui vient d'enchaîner des XS budgéterait ses XL comme des XS — et la chaîne
 * afficherait une estimation de XS pour un XL.
 *
 * Elle sort en USD **et** en part du budget mensuel du plan de l'utilisateur :
 * c'est cette part-là que l'UI affiche — jamais de dollars dans l'UI.
 */

/** Runs regardés pour médianiser. Assez pour lisser, assez récent pour valoir. */
const HISTORY_RUNS = 60;

export interface ChainCostEstimate {
  /** Coût attendu du parcours complet, en USD. */
  usd: number;
  /** Sa part du budget mensuel inclus du plan, entre 0 et 1 (0 si budget nul). */
  shareOfMonthlyBudget: number;
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

interface HistoryRow {
  intent: AgentLaunchIntent;
  cost_usd: number | string;
  /** L'embed PostgREST rend un objet (relation *-to-one) — parfois un tableau. */
  issues: { effort: IssueEffort | null } | { effort: IssueEffort | null }[] | null;
}

function effortOf(row: HistoryRow): IssueEffort | null {
  const embedded = Array.isArray(row.issues) ? row.issues[0] : row.issues;
  return embedded?.effort ?? null;
}

/**
 * Coût médian par intention, RAMENÉ À L'ÉQUIVALENT-M, sur les derniers runs du
 * projet. Les runs à coût nul sont ÉCARTÉS : un run mort à l'amorçage (dépôt
 * injoignable, quota) n'a rien consommé, et le compter tirerait toutes les
 * médianes vers zéro — c'est-à-dire vers une estimation qui rassure et un
 * plafond qui coupe.
 */
async function medianCostByIntent(
  projectId: string,
): Promise<Partial<Record<AgentLaunchIntent, number>>> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("intent, cost_usd, issues(effort)")
    .eq("project_id", projectId)
    .not("intent", "is", null)
    .gt("cost_usd", 0)
    .order("created_at", { ascending: false })
    .limit(HISTORY_RUNS);
  const rows = (data ?? []) as unknown as HistoryRow[];
  const buckets = new Map<AgentLaunchIntent, number[]>();
  for (const row of rows) {
    const cost = Number(row.cost_usd);
    if (!Number.isFinite(cost) || cost <= 0) continue;
    // Normalisation : ce run a coûté ça POUR SA TAILLE — on le ramène à ce
    // qu'il aurait coûté sur un M, pour pouvoir le comparer aux autres.
    const factor = effortCostFactor(effortOf(row));
    if (factor <= 0) continue;
    const list = buckets.get(row.intent) ?? [];
    list.push(cost / factor);
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

  // Les deux dimensions se multiplient : ce que l'étape FAIT × la TAILLE du
  // ticket. La base vient de l'historique du projet quand il en a, du repli
  // sinon — les deux étant exprimées en équivalent-M.
  const factor = effortCostFactor(params.issue.effort);
  let fromHistory = false;
  const usd = modes.reduce((sum, mode) => {
    const known = history[intentOfMode(mode)];
    if (known != null) fromHistory = true;
    return sum + (known ?? DEFAULT_STEP_COST_USD[mode]) * factor;
  }, 0);

  const included = billing?.plan.includedUsageUsd ?? 0;
  return {
    usd: Number(usd.toFixed(6)),
    shareOfMonthlyBudget: included > 0 ? usd / included : 0,
    modes,
    fromHistory,
  };
}
