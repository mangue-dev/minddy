import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { claimRun, requeueStuckRuns } from "./runs";
import { executeAgentRun } from "./execute";

/**
 * Drain des runs de l'agent (MIN-46) — le worker. Auto-budgété sous les 300s de
 * la fonction : reclaim les runs bloqués, puis boucle claim→execute tant qu'il
 * reste du budget et des runs dus. Un run suspendu se re-`queue` avec
 * not_before=now → la re-requête suivante le reprend EN PROCESS (continuation
 * basse latence), comme AutoKap.
 */

/** Budget d'un drain (sous les 300s de maxDuration). */
const DRAIN_TIME_BUDGET_MS = 270_000;
/** On ne démarre pas un chunk s'il reste moins que ça. */
const MIN_CHUNK_BUDGET_MS = 40_000;

/** True s'il existe au moins un run queued et dû maintenant. */
export async function hasDueAgentWork(service: SupabaseClient): Promise<boolean> {
  const { data } = await service
    .from("agent_runs")
    .select("id")
    .eq("status", "queued")
    .lte("not_before", new Date().toISOString())
    .limit(1);
  return ((data ?? []) as Array<{ id: string }>).length > 0;
}

export async function drainAgentRuns(
  service: SupabaseClient,
): Promise<{ claimed: number }> {
  const deadline = Date.now() + DRAIN_TIME_BUDGET_MS;
  let claimed = 0;

  await requeueStuckRuns(service);

  while (deadline - Date.now() >= MIN_CHUNK_BUDGET_MS) {
    const { data } = await service
      .from("agent_runs")
      .select("id")
      .eq("status", "queued")
      .lte("not_before", new Date().toISOString())
      .order("not_before", { ascending: true })
      .limit(10);
    const rows = (data ?? []) as Array<{ id: string }>;
    if (rows.length === 0) break;

    let didWork = false;
    for (const row of rows) {
      if (deadline - Date.now() < MIN_CHUNK_BUDGET_MS) break;
      const run = await claimRun(row.id);
      if (!run) continue; // course perdue (autre drain/cron)
      claimed++;
      didWork = true;
      const chunkBudget = deadline - Date.now();
      await executeAgentRun(run, { deadlineMs: chunkBudget });
    }
    if (!didWork) break;
  }

  return { claimed };
}
