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
 * What a string will cost (MIN-147) — a DISPLAY, and nothing else: nothing interrupts on it (see the lib/automations header on no cap
 * per string). It is used to answer “is this going to cost me a lot?” » before
 * to arm the loop, not to cut it once launched.
 *
 * It is read in the history of the project rather than in a price table: the
 * MEDIAN of the cost of the last runs, by intention. A median because a single
 * run gone into a spin should not move the estimate of all subsequent ones.
 * Without history, the fallback is `DEFAULT_STEP_COST_USD`.
 *
 * Two dimensions, not one: what the run DOES (plan, code, verify) and
 * the SIZE of the ticket. The runs in the history are therefore reduced to their
 * M-equivalent (`effortCostFactor`) before being medianized, then the median is
 * rescaled to the ticket that is estimated. Without this normalization, a project
 * that has just chained XS would budget its XL as XS — and the chain
 * would display an estimate of :
 * this is what the UI displays — never dollars in the UI.
 */

/** Runs watched to mediate. Enough to smooth, recent enough to be worth. */
const HISTORY_RUNS = 60;

export interface ChainCostEstimate {
  /** Expected cost of the complete route, in USD. */
  usd: number;
  /** Its share of the monthly budget included in the plan, between 0 and 1 (0 if zero budget). */
  shareOfMonthlyBudget: number;
  /** The encrypted steps, in order — enough to name them on the screen. */
  modes: (AgentLaunchMode | "custom")[];
  /** Does the estimate come from the history of the project, or from fallback? */
  fromHistory: boolean;
}

/** Median of a non-empty series. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** The mode of a step, reduced to the intention persisted on the run. */
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
 * Median cost per intention, REDUCED TO M-EQUIVALENT, on the last runs of the
 * project. Zero-cost runs are DISREGARDED: a dead run at start-up (deposit
 * unreachable, quota) has not consumed anything, and counting it would pull all the
 * medians towards zero — that is to say towards an estimate which reassures and a
 * ceiling which cuts.
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
    // Normalization: this run cost this FOR ITS SIZE — we bring it back to this
    // what it would have cost on an M, to be able to compare it to the others.
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
 * The event from which the journey starts. TO BE PROVIDED when we encrypt a string
 * that we open: the default ("the ticket has just entered its current status
 *") is false at the precise moment of a transition — a ticket which passes
 * `backlog → todo` is still in `backlog` in base when the hook calls,
 * and simulating from `backlog` plays NO steps. The cap then dropped
 * to zero, and the chain stopped on "budget" before its first step.
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

  // The two dimensions are multiplied: what the step DOES × the SIZE of the
  // ticket. The basis comes from the history of the project when it has any, from the withdrawal
  // otherwise — both being expressed in M-equivalent.
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
