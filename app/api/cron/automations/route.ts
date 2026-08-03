import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { duePendingChains } from "@/lib/server/automations/chain";
import { runAutomations } from "@/lib/server/automations/engine";
import { captureServerEvent } from "@/lib/server/posthog";
import { durationBucket } from "@/lib/analytics-sanitize";
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

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const due = await duePendingChains(SWEEP_LIMIT);

  // En SÉRIE : deux chaînes dues appartiennent presque toujours au même projet,
  // et chacune lance un run. Les paralléliser ne ferait que bousculer le quota
  // et la file du drain pour gagner quelques centaines de millisecondes.
  let started = 0;
  for (const chain of due) {
    // Sans événement mis de côté, on ne sait pas POURQUOI elle a été ouverte :
    // impossible de la rejouer honnêtement. On la laisse au balayeur suivant
    // plutôt que d'inventer un déclencheur (le cas n'existe que si la ligne a
    // été écrite à la main).
    if (!chain.pending_event?.to) continue;
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

  captureServerEvent({
    distinctId: "cron",
    event: "cron_executed",
    properties: {
      job: "automations",
      due: due.length,
      started,
      duration_bucket: durationBucket(Date.now() - startedAt),
    },
  });

  return NextResponse.json({ ok: true, due: due.length, started });
}

export const GET = handle;
export const POST = handle;
