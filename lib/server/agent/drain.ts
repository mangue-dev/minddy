import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { claimRun, requeueStuckRuns } from "./runs";
import { executeAgentRun } from "./execute";
import { stopSandboxByName } from "./sandbox";

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
/** Inactivité au-delà de laquelle on coupe la microVM d'un run au repos. */
const SANDBOX_IDLE_REAP_MS = 5 * 60_000;
/** Runs au repos dont la microVM peut être coupée : suspendus ET tours finis
    (MIN-68 : un tour fini garde sa sandbox pour une reprise à chaud éventuelle —
    sans ce reaping, chaque run terminé fuiterait une microVM). */
const RESTING_STATUSES = ["needs_input", "completed"];

/**
 * Reaper d'inactivité : coupe la microVM des runs AU REPOS (suspendus ou tour fini)
 * restés inactifs (> ~5 min) tout en gardant leur snapshot persistant → le run reste
 * reprennable (réveil rapide au prochain message, sans re-clone complet). Ne touche
 * ni au statut, ni au checkpoint, ni à sandbox_id : marque juste sandbox_stopped_at
 * pour ne pas re-couper en boucle. Appelé en tête de chaque drain (~2 min via cron).
 */
export async function reapIdleSandboxes(
  service: SupabaseClient,
): Promise<{ reaped: number }> {
  const cutoff = new Date(Date.now() - SANDBOX_IDLE_REAP_MS).toISOString();
  const { data } = await service
    .from("agent_runs")
    .select("id, sandbox_id")
    .in("status", RESTING_STATUSES)
    .not("sandbox_id", "is", null)
    .is("sandbox_stopped_at", null)
    .lt("last_activity_at", cutoff)
    .order("last_activity_at", { ascending: true }) // les plus inactifs d'abord
    .limit(50);
  const rows = (data ?? []) as Array<{ id: string; sandbox_id: string | null }>;
  let reaped = 0;
  for (const row of rows) {
    if (!row.sandbox_id) continue;
    // CAS AVANT de stopper : on réserve la coupe (sandbox_stopped_at) sous garde. Si
    // le run a été repris (steer) ou re-activé (heartbeat) depuis le SELECT, la garde
    // ne matche pas → on NE stoppe PAS une microVM en cours d'utilisation.
    const { data: claimed } = await service
      .from("agent_runs")
      .update({ sandbox_stopped_at: new Date().toISOString() })
      .eq("id", row.id)
      .in("status", RESTING_STATUSES)
      .is("sandbox_stopped_at", null)
      .lt("last_activity_at", cutoff)
      .select("id")
      .maybeSingle();
    if (!claimed) continue; // reprise/activité concurrente → on laisse la VM tranquille
    await stopSandboxByName(row.sandbox_id);
    reaped++;
  }
  return { reaped };
}

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
  // Libère les microVM des sessions au repos inactives (garde le snapshot).
  await reapIdleSandboxes(service).catch((err) =>
    console.error("[agent-drain] reap failed:", (err as Error).message),
  );

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
