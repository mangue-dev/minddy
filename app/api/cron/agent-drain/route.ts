import { NextResponse, after, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";

import { getServiceClient } from "@/lib/supabase-service";
import { drainAgentRuns } from "@/lib/server/agent/drain";
import { chainAgentDrain } from "@/lib/server/agent/drain-chain";
import { captureServerEvent } from "@/lib/server/posthog";
import { durationBucket } from "@/lib/analytics-sanitize";

/**
 * Worker de l'agent de code (MIN-46). Draine les runs dus (auto-budget 270s sous
 * les 300s), puis auto-invoque si du travail reste (handoff des runs > 300s).
 * Deux déclencheurs partagent ce handler : le Vercel Cron toutes les 2 min (GET) et
 * l'auto-invocation (POST `?chain=N`, toutes les 2 min pour le cron). Vercel envoie automatiquement
 * `Authorization: Bearer ${CRON_SECRET}` ; sans ce secret, la route est 401.
 */

export const runtime = "nodejs";
/**
 * 800 s, le maximum du plan Pro sous Fluid Compute (300 s n'est que le DÉFAUT).
 *
 * C'est le levier qui rend l'agent continu : un chunk de treize minutes au lieu de
 * cinq, donc un sous-agent qui travaille ~10 min d'affilée sans jamais passer par
 * la reprise. Le coût ne triple pas pour autant — la facturation Fluid est à l'Active
 * CPU, et une boucle d'agent passe l'essentiel de son temps à ATTENDRE un modèle,
 * pas à calculer.
 *
 * Ne vaut QUE pour cette route : les drains déclenchés par un lancement utilisateur
 * (`launchAgentRun` via `after`) tournent dans des fonctions de 300 s et gardent le
 * budget par défaut de `drainAgentRuns`.
 */
export const maxDuration = 800;
/** Budget du drain, sous le `maxDuration` ci-dessus (marge pour la réponse + le kick). */
const CRON_DRAIN_BUDGET_MS = 760_000;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = getServiceClient();
  const startedAt = Date.now();
  const summary = await drainAgentRuns(service, { budgetMs: CRON_DRAIN_BUDGET_MS });
  // Santé du worker (MIN-78) : un cron qui ne réclame plus rien, ou qui frôle
  // les 300 s, est un incident silencieux — invisible dans les stats produit.
  captureServerEvent({
    distinctId: "cron",
    event: "cron_executed",
    properties: {
      job: "agent-drain",
      claimed: summary.claimed,
      duration_bucket: durationBucket(Date.now() - startedAt),
      trigger: request.method === "POST" ? "chain" : "schedule",
    },
  });

  const chain = Number(request.nextUrl.searchParams.get("chain") ?? "0") || 0;
  if (summary.claimed > 0) {
    after(async () => {
      await chainAgentDrain({ supabase: service, chain, origin: request.nextUrl.origin });
    });
  }

  return NextResponse.json({ ok: true, claimed: summary.claimed });
}

export const GET = handle;
export const POST = handle;
