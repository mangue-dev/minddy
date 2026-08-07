import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { claimRun, requeueStuckRuns } from "./runs";
// Le seuil d'admission d'un chunk ne se pose pas ici : il DÉRIVE de ce que le chunk
// s'accorde une fois démarré, plus son amorçage (MIN-213). Deux chiffres écrits à la
// main de part et d'autre de cette frontière se contredisaient — le drain admettait
// 40 s là où le chunk s'en garantissait 45, avant même le réveil de la microVM.
import { MIN_CHUNK_BUDGET_MS } from "./chunk-budget";
import { executeAgentRun } from "./execute";
import { stopSandboxByName } from "./sandbox";
import { revokeRunKey } from "./run-key";
import { currentDeploymentScope } from "./deployment";

/**
 * Drain des runs de l'agent (MIN-46) — le worker. Auto-budgété sous les 300s de
 * la fonction : reclaim les runs bloqués, puis boucle claim→execute tant qu'il
 * reste du budget et des runs dus. Un run suspendu se re-`queue` avec
 * not_before=now → la re-requête suivante le reprend EN PROCESS (continuation
 * basse latence), comme AutoKap.
 */

/**
 * Budget d'un drain lancé depuis une route de 300 s (`launchAgentRun` via `after`).
 * Le CRON, lui, tourne dans une fonction de 800 s et passe son propre budget : le
 * budget ne peut pas être une constante globale, sinon un drain déclenché par un
 * lancement utilisateur croirait disposer de treize minutes et se ferait tuer en
 * plein chunk — checkpoint non écrit, tour perdu.
 */
const DRAIN_TIME_BUDGET_MS = 270_000;
/** Inactivité au-delà de laquelle on coupe la microVM d'un run au repos. */
const SANDBOX_IDLE_REAP_MS = 5 * 60_000;
/** Runs au repos dont la microVM peut être coupée. `completed` = le seul repos du
    modèle conversationnel (la session garde sa sandbox pour une reprise à chaud —
    sans ce reaping, chaque tour fini fuiterait une microVM). */
const RESTING_STATUSES = ["completed"];

/**
 * Reaper d'inactivité : coupe la microVM des runs AU REPOS (suspendus ou tour fini)
 * restés inactifs (> ~5 min) tout en gardant leur snapshot persistant → le run reste
 * reprennable (réveil rapide au prochain message, sans re-clone complet). Ne touche
 * ni au statut, ni au checkpoint, ni à sandbox_id : marque juste sandbox_stopped_at
 * pour ne pas re-couper en boucle. Appelé en tête de chaque drain (~2 min via cron).
 *
 * IL RÉVOQUE AUSSI LA CLÉ DU RUN (MIN-223). C'est ici, et pas au bout du run,
 * parce qu'une session au repos n'est pas finie : elle peut repartir sur un
 * `steer`, et c'est ce redémarrage qui remintera. Tant que la VM tourne, sa clé
 * doit vivre ; dès qu'elle est coupée, plus personne n'a de raison légitime de
 * s'en servir — et la seule chose qui pourrait encore le faire serait quelque
 * chose qu'on n'a pas voulu.
 */
export async function reapIdleSandboxes(
  service: SupabaseClient,
): Promise<{ reaped: number }> {
  const cutoff = new Date(Date.now() - SANDBOX_IDLE_REAP_MS).toISOString();
  const { data } = await service
    .from("agent_runs")
    .select("id, sandbox_id, provider_key_id")
    .in("status", RESTING_STATUSES)
    .not("sandbox_id", "is", null)
    .is("sandbox_stopped_at", null)
    .lt("last_activity_at", cutoff)
    .order("last_activity_at", { ascending: true }) // les plus inactifs d'abord
    .limit(50);
  const rows = (data ?? []) as Array<{
    id: string;
    sandbox_id: string | null;
    provider_key_id: string | null;
  }>;
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
    // La VM d'abord, la clé ensuite : dans cet ordre, une révocation qui échoue
    // laisse une clé plafonnée sans machine pour s'en servir. L'ordre inverse
    // ouvrirait une fenêtre où la VM tourne encore avec une clé morte, et le tour
    // en cours de reprise mourrait sur des 401.
    if (row.provider_key_id) {
      await revokeRunKey(row.provider_key_id);
      await service.from("agent_runs").update({ provider_key_id: null }).eq("id", row.id);
    }
    reaped++;
  }
  return { reaped };
}

/**
 * Restreint une requête de file au périmètre du déploiement courant (MIN-165).
 * Les DEUX requêtes de file passent par ici : si elles divergeaient, un drain
 * verrait du travail dû qu'il n'a pas le droit de claim et bouclerait à vide.
 *
 * Générique NON contraint, avec le cast à l'intérieur : contraindre `Q` sur la
 * forme de `is`/`eq` fait exploser l'inférence sur le builder Postgrest (TS2589),
 * et renvoyer une interface minimale ferait perdre `order`/`limit` à l'appelant.
 */
function scopeToDeployment<Q>(query: Q, scope: string | null): Q {
  const q = query as unknown as {
    is(column: string, value: null): unknown;
    eq(column: string, value: string): unknown;
  };
  return (scope === null
    ? q.is("deployment_url", null)
    : q.eq("deployment_url", scope)) as Q;
}

/** True s'il existe au moins un run queued et dû maintenant, DANS LE PÉRIMÈTRE
 *  du déploiement courant (MIN-165) — un preview ne chaîne pas sur les runs de
 *  la prod, la prod ne chaîne pas sur ceux d'un preview. */
export async function hasDueAgentWork(service: SupabaseClient): Promise<boolean> {
  const { data } = await scopeToDeployment(
    service
      .from("agent_runs")
      .select("id")
      .eq("status", "queued")
      .lte("not_before", new Date().toISOString()),
    currentDeploymentScope(),
  ).limit(1);
  return ((data ?? []) as Array<{ id: string }>).length > 0;
}

export async function drainAgentRuns(
  service: SupabaseClient,
  opts?: {
    /** Budget mural de CE drain. Doit rester sous le `maxDuration` de la route qui
     *  l'appelle : c'est l'appelant, et lui seul, qui connaît sa propre durée. */
    budgetMs?: number;
  },
): Promise<{ claimed: number }> {
  const deadline = Date.now() + (opts?.budgetMs ?? DRAIN_TIME_BUDGET_MS);
  // Périmètre du déploiement (MIN-165) : résolu UNE fois, il ne bouge pas d'un
  // tour de boucle à l'autre. `requeueStuckRuns` et `reapIdleSandboxes` restent
  // GLOBAUX : ni le requeue d'un claim mort ni la coupe d'une microVM au repos
  // ne dépendent de la logique d'agent, et les scoper laisserait la VM d'un run
  // preview tourner jusqu'au timeout de session.
  const scope = currentDeploymentScope();
  let claimed = 0;

  await requeueStuckRuns(service);
  // Libère les microVM des sessions au repos inactives (garde le snapshot).
  await reapIdleSandboxes(service).catch((err) =>
    console.error("[agent-drain] reap failed:", (err as Error).message),
  );

  while (deadline - Date.now() >= MIN_CHUNK_BUDGET_MS) {
    const { data } = await scopeToDeployment(
      service
        .from("agent_runs")
        .select("id")
        .eq("status", "queued")
        .lte("not_before", new Date().toISOString()),
      scope,
    )
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
