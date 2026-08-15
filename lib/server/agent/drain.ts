import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { recordSandboxUsage } from "@/lib/server/usage";
import { spentFromLedger, type AiUsageBillTo } from "@/lib/server/ai-usage";

import { appendEvent, claimRun, notifyAgentRun, stampRun } from "./runs";
import { SANDBOX_USAGE_SEQ_BASE } from "./pr-landing";
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
/**
 * CE QUE COÛTE UN LANCEMENT, et plus ce que coûtait un chunk (MIN-225).
 *
 * `executeAgentRun` n'exécute plus le tour : il réveille ou clone la microVM,
 * écrit le job et le bundle, lance le superviseur en détaché et REND LA MAIN. Le
 * seuil d'admission n'a donc plus à couvrir treize minutes de travail — seulement
 * un amorçage, dont le clone est le poste le plus lourd (~22 s mesurées, MIN-222)
 * et dont le timeout propre est de 180 s.
 *
 * Deux minutes : large pour un amorçage tiède, honnête sur un clone froid. En
 * dessous, on préfère laisser le run à `queued` — le tick suivant le reprendra
 * avec une fenêtre entière plutôt que de se faire tuer en plein `writeFiles`,
 * qui laisserait une microVM debout et un run `running` sans process.
 */
const MIN_LAUNCH_BUDGET_MS = 120_000;
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
 * Silence après lequel une réponse INDÉTERMINÉE finit par valoir un décès.
 *
 * La règle reste « on ne conclut pas sur un silence de l'API » — mais elle ne
 * peut pas valoir *pour toujours*. Une microVM détruite (session expirée,
 * plateforme qui l'a rendue) répond « introuvable » à chaque passage, donc
 * `null`, donc rien : le run restait `running` jusqu'à ce qu'un humain le
 * supprime en base. Ce qui manquait n'était pas un verdict plus audacieux, c'est
 * une BORNE : passé deux heures sans le moindre signe de vie de la boucle ET sans
 * que la plateforme sache seulement dire qu'elle existe, la panne d'API qui
 * expliquerait les deux n'est plus l'hypothèse raisonnable.
 *
 * Deux heures = 24 fois l'intervalle de sauvegarde du checkpoint (5 min), qui est
 * le battement de cœur de la boucle. Le pire cas assumé — un round unique qui
 * dure plus de deux heures pendant une panne totale de l'API Sandbox — remet la
 * session au repos sur son dernier checkpoint : elle reste reprennable, ce qui
 * est très exactement ce que le run bloqué, lui, n'était pas.
 */
const VM_LOOP_LOST_AFTER_MS = 2 * 60 * 60_000;

/**
 * Délai au-delà duquel un run `running` SANS identifiant de commande est réputé
 * n'avoir jamais démarré sa boucle.
 *
 * `startVmLoop` écrit cet identifiant à la fin de l'amorçage (~22 s à froid) : une
 * ligne qui ne l'a toujours pas au bout d'un quart d'heure est une fonction morte
 * entre le claim et le lancement. Il n'y a rien à sonder — pas de commande, donc
 * pas de constat possible — et c'est précisément le cas que l'ancienne rédaction
 * laissait filer sans le dire (`.not("loop_command_id", "is", null)` dans la
 * requête : ces runs-là n'étaient même pas regardés).
 *
 * Compté sur `started_at` (posé au claim, donc propre à CE tour) et non sur le
 * silence : un run re-queué avec un délai devant lui arrive au claim avec une
 * horloge d'activité déjà vieille, et le compter là le tuerait en plein amorçage.
 */
const VM_LOOP_UNLAUNCHED_AFTER_MS = 15 * 60_000;

/**
 * LE CHIEN DE GARDE des runs dont la boucle vit dans la microVM (MIN-224).
 *
 * IL A REMPLACÉ le balayeur par présomption (retiré en MIN-225), et ce n'était
 * pas le même geste. L'ancien déclarait mort tout run `running` silencieux depuis
 * vingt minutes, puis lui volait son claim — une heuristique acceptable quand un chunk durait
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
 *   remettrait au repos des tours en pleine santé. Mais l'attente est BORNÉE
 *   (`VM_LOOP_LOST_AFTER_MS`, et `VM_LOOP_UNLAUNCHED_AFTER_MS` pour une ligne qui
 *   n'a même pas de commande à interroger) : « on ne sait pas » ne peut pas durer
 *   toujours, sans quoi un run reste `running` jusqu'à ce qu'un humain le
 *   supprime en base ;
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
      "id, sandbox_id, loop_command_id, local_exec, created_by, project_id, issue_id, provider_key_id, run_id, routine_id, continuations, started_at, last_activity_at, cost_usd",
    )
    .eq("status", "running")
    .lt("last_activity_at", cutoff)
    .limit(50);
  const rows = (data ?? []) as Array<{
    id: string;
    sandbox_id: string | null;
    loop_command_id: string | null;
    local_exec: boolean | null;
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
    provider_key_id: string | null;
    run_id: string | null;
    routine_id: string | null;
    continuations: number;
    started_at: string | null;
    last_activity_at: string | null;
    cost_usd: number;
  }>;

  /**
   * LES SONDES EN PARALLÈLE, les conduites en série.
   *
   * Constater qu'un process VIT coûte le délai entier de `isLoopCommandAlive`
   * (5 s : c'est l'absence de réponse qui fait la réponse). En série, une file de
   * vingt runs en bonne santé mangerait une minute et demie du budget du drain
   * avant qu'il n'ait claim quoi que ce soit. Les sondes ne se touchent pas entre
   * elles — les mettre de front ramène le coût à celui d'UNE.
   */
  const verdicts = await Promise.all(
    rows.map(async (row) => ({
      row,
      alive:
        row.sandbox_id && row.loop_command_id
          ? await isLoopCommandAlive(row.sandbox_id, row.loop_command_id)
          : null,
    })),
  );

  /**
   * Depuis combien de temps ce tour ne donne-t-il plus signe de vie, et depuis
   * combien de temps a-t-il été claim ? `null` (date absente) = on ne sait pas, et
   * on ne borne alors rien : les deux replis temporels ci-dessous ne servent qu'à
   * fermer un cas qu'on a CONSTATÉ ouvert, jamais à conclure sur une ignorance.
   */
  const agedMs = (at: string | null): number | null => {
    const ms = at ? Date.parse(at) : NaN;
    return Number.isFinite(ms) ? Date.now() - ms : null;
  };

  let reaped = 0;
  for (const { row, alive } of verdicts) {
    if (alive === true) continue; // le process vit : on ne touche à rien.
    if (alive === null) {
      /**
       * On ne SAIT PAS — et il y a maintenant trois façons de ne pas savoir.
       *
       * **Sans identifiant de commande**, il n'y a rien à interroger : la boucle
       * n'a jamais été lancée, et passé le délai d'amorçage c'est un fait, pas une
       * présomption. **Avec un identifiant**, c'est la plateforme qui ne répond
       * pas : on lui laisse deux heures avant d'en tirer une conclusion.
       *
       * **ET SUR UNE MACHINE, ON NE SAURA JAMAIS (MIN-355).** Un run local n'a ni
       * microVM ni commande — il n'y a personne à qui poser la question. Il tombait
       * donc dans la première branche, celle du « jamais lancé », qui n'est fondée
       * que parce qu'un amorçage de microVM dure vingt secondes : trois minutes de
       * silence (le seuil de la requête ci-dessus) sur un run vieux d'un quart
       * d'heure suffisaient à le déclarer mort, à publier « l'agent s'est arrêté »
       * et à facturer du compute. Un Mac qui dort quatre minutes perdait son tour,
       * là où un run cloud dont l'API ne répond pas a droit à deux heures.
       *
       * On lui donne donc la MÊME borne que ce cas-là, et pour la même raison : ce
       * qui manque n'est pas un verdict plus audacieux, c'est une borne. Le harness
       * écrit `last_activity_at` toutes les deux minutes
       * (`SUPERVISOR_CHECKPOINT_SAVE_INTERVAL_MS`) ; deux heures, c'est soixante
       * battements manqués — et un tour qui reviendrait après, s'il revient,
       * retrouve sa session au repos sur son dernier checkpoint plutôt qu'un run
       * `running` que personne ne joue.
       */
      // Il y a quelqu'un à interroger, ou personne par nature : dans les deux cas
      // le silence est ce qui décide, et il a deux heures. Reste le seul cas où
      // une réponse était DUE et n'est jamais venue — une microVM sans commande.
      const lost =
        row.local_exec || row.loop_command_id
          ? (agedMs(row.last_activity_at) ?? 0) >= VM_LOOP_LOST_AFTER_MS &&
            (agedMs(row.started_at) ?? 0) >= VM_LOOP_LOST_AFTER_MS
          : (agedMs(row.started_at) ?? 0) >= VM_LOOP_UNLAUNCHED_AFTER_MS;
      if (!lost) continue;
    }

    /**
     * LE STAMP D'ABORD, LE FIL ENSUITE — l'ordre inverse de celui d'origine, et
     * c'est une leçon de production.
     *
     * L'argument d'avant était : « si le stamp échoue derrière, l'utilisateur
     * aura quand même lu pourquoi son tour s'est arrêté ». Mais la seule façon
     * dont ce stamp échoue est sa garde `status in ('running')`, c'est-à-dire :
     * **quelqu'un a conclu ce run entre-temps**. Le tour ne s'est alors pas
     * arrêté du tout — il vient de finir. On écrivait donc un message d'échec
     * dans une conversation qui s'était bien terminée, et c'est ce qu'on a lu
     * sur le run de la PR 51.
     *
     * Ce qu'on perd est un cas qui n'existe pas : un stamp refusé laissait, dans
     * l'ancien ordre, une erreur orpheline ; dans celui-ci, le passage suivant du
     * drain reverra le run s'il est vraiment resté `running`.
     *
     * Le CHECKPOINT N'EST PAS TOUCHÉ : celui qui est en base est le dernier
     * sauvegardé périodiquement par la boucle, à une frontière de round sûre.
     * C'est exactement ce depuis quoi le tour suivant doit repartir.
     */
    const stamped = await stampRun(row.id, {
      status: "completed",
      error_message: "The agent process stopped unexpectedly",
      continuations: 0,
      attempts: 0,
      last_activity_at: new Date().toISOString(),
      interrupt_requested: false,
      loop_command_id: null,
    });
    if (!stamped) continue; // course : quelqu'un a conclu entre-temps.

    await appendEvent(row.id, "error", {
      code: "turnLost",
      message:
        "This turn's process stopped before it could finish. The session was restored from its last save — send a message to carry on.",
    }).catch(() => {});

    /**
     * LE COMPUTE DE LA MICROVM, ET C'EST ICI QUE PERSONNE NE LE FACTURERAIT.
     *
     * Dans la nouvelle forme, le wall-clock de la VM est tenu par la boucle et
     * remonté dans son rapport de fin de tour (`vm-rest.ts`) — et la fonction ne
     * facture plus rien de son côté.
     * Un tour dont le process meurt ne rend jamais ce rapport : sans cette ligne,
     * le réveil, le clone et les heures de microVM sortent de tous les compteurs
     * en silence. C'est la moitié compute de la facture, sur le seul chemin où
     * l'on ne s'en apercevrait pas.
     *
     * PAS DE DOUBLE COMPTE AVEC LE RAPPORT DE FIN DE TOUR, et c'est l'ORDRE des
     * deux gestes qui le garantit, pas la chance. Ici on stampe PUIS on facture
     * (`if (!stamped) continue`, juste au-dessus) ; `landVmTurn` fait l'inverse.
     * Un tour qui rend son rapport pendant qu'on le croit mort fait donc échouer
     * notre garde (`status in ('running')`) et on n'écrit rien. Et le cas
     * symétrique ne se pose pas : notre verdict EST « le process a rendu », or un
     * process qui a rendu ne poste plus.
     *
     * De `started_at` à MAINTENANT, et c'est un MINORANT malgré les apparences :
     * la SESSION de microVM survit à son process de boucle, et ne sera coupée que
     * par le reaper d'inactivité — ~5 min après ce stamp, qui vient tout juste de
     * faire passer le run au repos. On facture donc moins que ce que la
     * plateforme nous facture, ce qui est le bon sens de l'erreur.
     *
     * ET RIEN DU TOUT POUR UN RUN LOCAL (MIN-355) : il n'y a pas eu de microVM.
     * Facturer ici du `sandbox_compute` sur des minutes de Mac reviendrait à faire
     * payer à l'utilisateur une machine qu'il a lui-même fournie — et à la faire
     * payer précisément sur le chemin de l'incident, celui qu'on ne relit pas.
     * La borne est SERVEUR, jamais un chiffre que le harness rendrait : c'est le
     * même principe que `sandboxMs`, et il vaut d'autant plus ici que la machine
     * est celle qu'on soupçonne.
     */
    const startedMs = row.started_at && !row.local_exec ? Date.parse(row.started_at) : NaN;
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

    /**
     * LA COLONNE DE DÉPENSE, RECOLLÉE AU LEDGER — ce que `landVmTurn` fait sur le
     * chemin sain (`vm-rest.ts`, le `Math.max` du rapport de fin de tour) et que
     * personne ne faisait ici. `cost_usd` n'est écrite que par les sorties saines :
     * un tour dont le process meurt laissait donc la ligne à ce qu'elle valait
     * avant le tour, c'est-à-dire **zéro** sur un premier tour — alors que le
     * ledger, lui, porte chaque round facturé avant l'accident.
     *
     * Mesuré en production sur la fenêtre d'observation d'opencode (MIN-286) :
     * trois runs moissonnés, `cost_usd = 0` sur les trois, **0,159 $** au ledger.
     * Rien n'était perdu pour la facture (`finance.ts` lit le ledger) ni pour les
     * plafonds (`control-plane.ts` et `execute.ts` prennent déjà le MAX des deux),
     * mais la ligne du run — ce qu'un humain relit après un incident — annonçait
     * gratuit un tour qui ne l'était pas.
     *
     * APRÈS `recordSandboxUsage`, pour que la somme relue porte aussi le compute
     * qu'on vient d'écrire. Et un MAX, pas une affectation : le ledger et la
     * colonne sont deux minorants, une dépense affichée ne recule jamais.
     */
    const spent = await spentFromLedger(row.run_id ?? row.id).catch(() => null);
    if (spent != null && spent > row.cost_usd) {
      await service.from("agent_runs").update({ cost_usd: spent }).eq("id", row.id);
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
  // tour de boucle à l'autre. Les deux balayeurs restent GLOBAUX : ni le constat
  // de décès ni la coupe d'une microVM au repos ne dépendent de la logique
  // d'agent, et les scoper laisserait la VM d'un run preview tourner jusqu'au
  // timeout de session.
  const scope = currentDeploymentScope();
  let claimed = 0;

  // LE chien de garde, et il n'y en a plus qu'un (MIN-225) : `requeueStuckRuns`
  // présumait la mort d'un run après vingt minutes de silence, ce qui n'a aucun
  // sens pour un tour qui vit dans la microVM et peut travailler une heure sans
  // écrire un event. Celui-ci ne présume rien, il DEMANDE à la plateforme si le
  // process vit. Best-effort — un constat de décès raté se rattrape au passage
  // suivant, une exception ici tuerait le drain entier.
  await reapDeadVmRuns(service).catch((err) =>
    console.error("[agent-drain] vm watchdog failed:", (err as Error).message),
  );
  // Libère les microVM des sessions au repos inactives (garde le snapshot).
  await reapIdleSandboxes(service).catch((err) =>
    console.error("[agent-drain] reap failed:", (err as Error).message),
  );

  while (deadline - Date.now() >= MIN_LAUNCH_BUDGET_MS) {
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
      if (deadline - Date.now() < MIN_LAUNCH_BUDGET_MS) break;
      const run = await claimRun(row.id);
      if (!run) continue; // course perdue (autre drain/cron)
      claimed++;
      didWork = true;
      await executeAgentRun(run, { deadlineMs: deadline - Date.now() });
    }
    if (!didWork) break;
  }

  return { claimed };
}
