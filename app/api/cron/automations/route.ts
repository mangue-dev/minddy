import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import {
  cancelPendingChain,
  duePendingChains,
  lastRunOfChain,
  staleRunningChains,
} from "@/lib/server/automations/chain";
import { activeRunForChain } from "@/lib/server/agent/runs";
import { haltChain } from "@/lib/server/automations/report";
import { runAutomations } from "@/lib/server/automations/engine";
import type { AutomationSource } from "@/lib/automations";
import type { IssueStatus } from "@/lib/issue-constants";

/**
 * Le BALAYEUR des chaînes en sursis (MIN-147).
 *
 * Une chaîne ouverte par un changement de statut attend quelques minutes avant
 * de démarrer : le temps de changer d'avis, de copier le prompt pour le faire
 * soi-même, ou de reclasser le ticket. Personne ne peut tenir cette attente dans
 * la fenêtre d'un `after()` — d'où ce cron.
 *
 * Route SÉPARÉE d'`agent-drain` à dessein : celui-ci a un budget de 800 s, sert
 * de répartiteur aux déploiements preview et ne doit pas voir sa fenêtre grignotée
 * par un travail qui n'a rien à voir. Ici, chaque réveil est court — le moteur ne
 * fait que lancer un run et rendre la main.
 *
 * C'est `runAutomations` qui décide vraiment : il re-vérifie que la condition
 * ayant ouvert la chaîne tient toujours (le ticket est-il encore dans ce
 * statut ?) et l'annule sinon. Le balayeur ne fait que sonner à la porte.
 */

export const runtime = "nodejs";
/** Un réveil = un lancement de run, jamais son exécution (c'est le drain qui l'a). */
export const maxDuration = 300;

/** Assez pour absorber une rafale, assez peu pour tenir dans la fenêtre. */
const SWEEP_LIMIT = 50;

/**
 * Passé ce retard, une chaîne en sursis n'a plus de sens : le monde a changé
 * depuis le geste qui l'a ouverte. Sans cette péremption, une chaîne que le
 * moteur refuse de démarrer (run manuel qui n'en finit pas, projet corbeillé)
 * restait `pending` POUR TOUJOURS — et, la file étant triée par ancienneté, une
 * cinquantaine d'entre elles suffisait à occuper 100 % de chaque balayage et à
 * affamer toutes les automatisations de la plateforme.
 */
const PENDING_MAX_LATENESS_MS = 60 * 60_000;

/**
 * Passé ce silence, une chaîne `running` est ABANDONNÉE : son crochet de fin de
 * run s'est perdu (fonction gelée, run manuel intercalé qui ne porte pas de
 * `chain_id`, exception après l'avancement). Rien d'autre ne la réveillait, et
 * comme `running` fait partie de l'index unique, son ticket n'acceptait plus
 * jamais d'automatisation.
 *
 * Très au-delà de la latence d'un crochet : on ne rattrape que ce qui est
 * manifestement mort. Le rattrapage est sans risque — c'est le compare-and-set
 * d'`advanceChain` qui tranche au bout, donc un événement simplement lent ne
 * peut pas produire un double lancement.
 */
const RUNNING_STALE_MS = 15 * 60_000;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const due = await duePendingChains(SWEEP_LIMIT);
  let expired = 0;
  let revived = 0;

  // En SÉRIE : deux chaînes dues appartiennent presque toujours au même projet,
  // et chacune lance un run. Les paralléliser ne ferait que bousculer le quota
  // et la file du drain pour gagner quelques centaines de millisecondes.
  let started = 0;
  for (const chain of due) {
    // Trop en retard, ou sans événement mis de côté (ligne écrite à la main) :
    // dans les deux cas elle ne démarrera jamais — on ne sait pas POURQUOI elle
    // a été ouverte, ou le monde a trop changé depuis. On la retire de la file
    // plutôt que de la relire indéfiniment.
    const lateness = Date.now() - Date.parse(chain.not_before ?? chain.created_at);
    if (!chain.pending_event?.to || lateness > PENDING_MAX_LATENESS_MS) {
      await cancelPendingChain(chain.id, "expired").catch(() => null);
      expired++;
      continue;
    }
    try {
      await runAutomations({
        issueId: chain.issue_id,
        projectId: chain.project_id,
        chainId: chain.id,
        startPending: true,
        event: {
          type: "status_changed",
          from: null,
          to: chain.pending_event.to as IssueStatus,
          source: chain.pending_event.source as AutomationSource,
        },
      });
      started++;
    } catch (err) {
      // Une chaîne qui explose ne doit pas emporter les suivantes.
      console.error("[automations-cron] chain failed:", chain.id, (err as Error).message);
    }
  }

  // ── Le filet des chaînes ABANDONNÉES ──────────────────────────────────────
  // Une chaîne `running` que plus aucun run ne porte : on rejoue la fin de son
  // dernier run, exactement ce que fait le bouton « Continuer ».
  for (const chain of await staleRunningChains(
    new Date(Date.now() - RUNNING_STALE_MS).toISOString(),
  )) {
    try {
      if (await activeRunForChain(chain.id)) continue; // elle travaille
      const last = await lastRunOfChain(chain.id);
      if (!last) {
        // Avancée puis jamais lancée (exception entre les deux) : rien à rejouer.
        await haltChain(chain, "stalled");
        revived++;
        continue;
      }
      await runAutomations({
        issueId: chain.issue_id,
        projectId: chain.project_id,
        chainId: chain.id,
        event: {
          type: "run_finished",
          intent: last.intent ?? "implement",
          outcome: last.status === "completed" ? "ok" : "failed",
        },
      });
      revived++;
    } catch (err) {
      console.error("[automations-cron] revive failed:", chain.id, (err as Error).message);
    }
  }

  return NextResponse.json({ ok: true, due: due.length, started, expired, revived });
}

export const GET = handle;
export const POST = handle;
