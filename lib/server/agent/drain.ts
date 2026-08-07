import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordSandboxUsage } from "@/lib/server/usage";
import type { AiUsageBillTo } from "@/lib/server/ai-usage";

import { appendEvent, claimRun, notifyAgentRun, requeueStuckRuns, stampRun } from "./runs";
import { SANDBOX_USAGE_SEQ_BASE } from "./pr-landing";
// Le seuil d'admission d'un chunk ne se pose pas ici : il DÉRIVE de ce que le chunk
// s'accorde une fois démarré, plus son amorçage (MIN-213). Deux chiffres écrits à la
// main de part et d'autre de cette frontière se contredisaient — le drain admettait
// 40 s là où le chunk s'en garantissait 45, avant même le réveil de la microVM.
import { MIN_CHUNK_BUDGET_MS } from "./chunk-budget";
import { executeAgentRun } from "./execute";
import { isLoopCommandAlive, stopSandboxByName } from "./sandbox";
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
 * Silence toléré avant d'aller DEMANDER à la plateforme si un tour vit encore.
 *
 * Ce n'est pas un seuil de mort — c'est un seuil d'INTERROGATION. Un tour qui
 * vient de démarrer ne vaut pas un appel à l'API Sandbox à chaque passage du
 * cron ; passé quelques minutes sans un event, la question devient légitime. La
 * réponse, elle, est un fait : `Command.exitCode` non nul ⇒ le process a rendu.
 */
const VM_LOOP_PROBE_AFTER_MS = 3 * 60_000;

/**
 * LE CHIEN DE GARDE des runs dont la boucle vit dans la microVM (MIN-224).
 *
 * IL REMPLACE `requeueStuckRuns` POUR CES RUNS-LÀ, et ce n'est pas le même geste.
 * L'ancien présumait mort tout run `running` silencieux depuis vingt minutes,
 * puis lui volait son claim — une heuristique acceptable quand un chunk durait
 * cinq minutes, intenable quand un tour peut travailler des heures sans écrire un
 * event (un `npm test` qui dure, un modèle qui réfléchit). Celui-ci ne présume
 * rien : il DEMANDE à la plateforme si la commande vit encore, et la plateforme
 * le sait.
 *
 * Trois réponses, trois conduites :
 *
 * - le process VIT → on ne touche à rien, quel que soit le silence ;
 * - on ne SAIT PAS (microVM introuvable, session expirée, API en panne) → on ne
 *   touche à rien non plus. Un chien de garde qui conclut sur un silence de l'API
 *   remettrait au repos des tours en pleine santé ;
 * - le process est MORT → la session repasse au repos sur son DERNIER CHECKPOINT
 *   (celui de la sauvegarde périodique), **le fil le dit**, et le compute de la
 *   microVM est facturé (cf. `recordSandboxUsage` plus bas). C'est ce qui
 *   distingue « l'agent s'est arrêté et voilà pourquoi » de « l'agent ne répond
 *   plus depuis vingt minutes ».
 */
export async function reapDeadVmRuns(service: SupabaseClient): Promise<{ reaped: number }> {
  const cutoff = new Date(Date.now() - VM_LOOP_PROBE_AFTER_MS).toISOString();
  const { data } = await service
    .from("agent_runs")
    .select(
      "id, sandbox_id, loop_command_id, created_by, project_id, issue_id, provider_key_id, run_id, routine_id, continuations, started_at",
    )
    .eq("status", "running")
    .eq("loop_in_vm", true)
    .not("loop_command_id", "is", null)
    .lt("last_activity_at", cutoff)
    .limit(50);
  const rows = (data ?? []) as Array<{
    id: string;
    sandbox_id: string | null;
    loop_command_id: string | null;
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
    provider_key_id: string | null;
    run_id: string | null;
    routine_id: string | null;
    continuations: number;
    started_at: string | null;
  }>;

  let reaped = 0;
  for (const row of rows) {
    if (!row.sandbox_id || !row.loop_command_id) continue;
    const alive = await isLoopCommandAlive(row.sandbox_id, row.loop_command_id);
    if (alive !== false) continue; // vivant, ou indéterminé : on ne conclut pas.

    // Le fil D'ABORD : si le stamp échoue derrière, l'utilisateur aura quand même
    // lu pourquoi son tour s'est arrêté. L'inverse laisserait une conversation
    // qui redevient silencieusement disponible, sans explication.
    await appendEvent(row.id, "error", {
      code: "turnLost",
      message:
        "This turn's process stopped before it could finish. The session was restored from its last save — send a message to carry on.",
    }).catch(() => {});
    // Le CHECKPOINT N'EST PAS TOUCHÉ : celui qui est en base est le dernier
    // sauvegardé périodiquement par la boucle, à une frontière de round sûre.
    // C'est exactement ce depuis quoi le tour suivant doit repartir.
    const stamped = await stampRun(row.id, {
      status: "completed",
      error_message: "The agent process stopped unexpectedly",
      continuations: 0,
      attempts: 0,
      window_started_at: null,
      last_activity_at: new Date().toISOString(),
      interrupt_requested: false,
      loop_command_id: null,
    });
    if (!stamped) continue; // course : quelqu'un a conclu entre-temps.

    /**
     * LE COMPUTE DE LA MICROVM, ET C'EST ICI QUE PERSONNE NE LE FACTURERAIT.
     *
     * Dans la nouvelle forme, le wall-clock de la VM est tenu par la boucle et
     * remonté dans son rapport de fin de tour (`vm-rest.ts`) — et la fonction ne
     * facture plus rien de son côté (`execute.ts`, la garde `!run.loop_in_vm`).
     * Un tour dont le process meurt ne rend jamais ce rapport : sans cette ligne,
     * le réveil, le clone et les heures de microVM sortent de tous les compteurs
     * en silence. C'est la moitié compute de la facture, sur le seul chemin où
     * l'on ne s'en apercevrait pas.
     *
     * De `started_at` à MAINTENANT, et c'est un MINORANT malgré les apparences :
     * la SESSION de microVM survit à son process de boucle, et ne sera coupée que
     * par le reaper d'inactivité — ~5 min après ce stamp, qui vient tout juste de
     * faire passer le run au repos. On facture donc moins que ce que la
     * plateforme nous facture, ce qui est le bon sens de l'erreur.
     */
    const startedMs = row.started_at ? Date.parse(row.started_at) : NaN;
    if (Number.isFinite(startedMs) && Date.now() > startedMs) {
      const billTo: AiUsageBillTo = row.created_by
        ? { userId: row.created_by }
        : { unattributed: `run ${row.id} sans created_by` };
      await recordSandboxUsage({
        runId: row.run_id ?? row.id,
        // Même bande de seq que les deux autres écrivains de compute : un run
        // migré ne collisionne pas avec les lignes de son passé.
        seq: SANDBOX_USAGE_SEQ_BASE + row.continuations,
        billTo,
        feature: row.routine_id ? "routine_compute" : "sandbox_compute",
        projectId: row.project_id,
        durationMs: Date.now() - startedMs,
      }).catch((err) =>
        console.error("[agent-drain] vm compute metering failed:", (err as Error).message),
      );
    }

    if (row.provider_key_id) {
      await revokeRunKey(row.provider_key_id);
      await service.from("agent_runs").update({ provider_key_id: null }).eq("id", row.id);
    }
    await notifyAgentRun(row, "agent_failed").catch(() => {});
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
  // Le chien de garde de la NOUVELLE forme (MIN-224), à côté de l'ancien
  // balayeur et pas à sa place : les deux populations coexistent le temps de la
  // migration, et chacune a le sien. Best-effort — un constat de décès raté se
  // rattrape au passage suivant, une exception ici tuerait le drain entier.
  await reapDeadVmRuns(service).catch((err) =>
    console.error("[agent-drain] vm watchdog failed:", (err as Error).message),
  );
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
