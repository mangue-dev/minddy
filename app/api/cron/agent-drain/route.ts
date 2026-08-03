import { NextResponse, after, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/server/cron-auth";

import { getServiceClient } from "@/lib/supabase-service";
import { drainAgentRuns } from "@/lib/server/agent/drain";
import { chainAgentDrain } from "@/lib/server/agent/drain-chain";
import {
  previewKickTargets,
  PREVIEW_STALE_AFTER_MS,
  type QueuedRunRow,
} from "@/lib/server/agent/deployment";
import { notifyAgentRun } from "@/lib/server/agent/runs";

/**
 * Worker de l'agent de code (MIN-46). Draine les runs dus (auto-budget 270s sous
 * les 300s), puis auto-invoque si du travail reste (handoff des runs > 300s).
 * Deux déclencheurs partagent ce handler : le Vercel Cron toutes les 2 min (GET) et
 * l'auto-invocation (POST `?chain=N`, toutes les 2 min pour le cron). Vercel envoie automatiquement
 * `Authorization: Bearer ${CRON_SECRET}` ; sans ce secret, la route est 401.
 *
 * En PRODUCTION, ce handler est aussi le RÉPARTITEUR des runs preview (MIN-165) :
 * son drain ne claim plus que la file commune, et il réveille par un POST les
 * déploiements qui ont du travail dû — sans jamais l'exécuter. C'est ce qui rend
 * le filet de sécurité compatible avec un test de branche : le cron reste allumé,
 * il ne mélange plus les codes.
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

/**
 * Runs preview dus, lus en prod pour la répartition. Plafond large devant le
 * plafond de réveils : c'est `previewKickTargets` qui décide, pas le SELECT.
 */
async function dueScopedRuns(service: SupabaseClient): Promise<QueuedRunRow[]> {
  const { data, error } = await service
    .from("agent_runs")
    .select("id, deployment_url, not_before")
    .eq("status", "queued")
    .not("deployment_url", "is", null)
    .lte("not_before", new Date().toISOString())
    .order("not_before", { ascending: true })
    .limit(50);
  if (error) {
    console.error("[agent-drain] preview dispatch read failed:", error.message);
    return [];
  }
  return (data ?? []) as QueuedRunRow[];
}

/** Réveille UN déploiement preview. Best-effort : la prod n'exécute jamais ces
 *  runs, elle sonne à la porte. */
async function kickDeployment(url: string, secret: string): Promise<void> {
  const origin = /^https?:\/\//.test(url) ? url : `https://${url}`;
  try {
    await fetch(`${origin}/api/cron/agent-drain?chain=0`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
    });
    console.log("[agent-drain] preview kick sent:", url);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      // Comme dans `chainAgentDrain` : la requête est délivrée, l'enfant draine.
      console.log("[agent-drain] preview kick sent (timeout):", url);
      return;
    }
    console.error("[agent-drain] preview kick failed:", url, error);
  }
}

/**
 * Déploiement mort : le run ne sera JAMAIS repris (le preview a été supprimé, ou
 * ne répond plus). Sans cette sortie, la ligne reste `queued` pour toujours — et
 * l'index unique `idx_agent_runs_active_issue` interdit alors tout nouveau run
 * sur le ticket. CAS sur `status` : un run repris entre-temps n'est pas touché.
 */
async function failStalledRuns(service: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data, error } = await service
    .from("agent_runs")
    .update({
      status: "failed",
      error_message: "Preview deployment unreachable",
      checkpoint: null,
    })
    .in("id", ids)
    .eq("status", "queued")
    .select("id, created_by, project_id, issue_id");
  if (error) {
    console.error("[agent-drain] stalled preview fail failed:", error.message);
    return;
  }
  const rows = (data ?? []) as Array<{
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
  }>;
  for (const row of rows) await notifyAgentRun(row, "agent_failed");
}

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = getServiceClient();
  const summary = await drainAgentRuns(service, { budgetMs: CRON_DRAIN_BUDGET_MS });

  // Répartition (MIN-165) : seule la PROD réveille les autres déploiements. Un
  // preview kické arrive ici avec VERCEL_ENV=preview et ne fait que son drain —
  // sans quoi deux déploiements se renverraient la balle indéfiniment.
  const secret = process.env.CRON_SECRET?.trim();
  const dispatch =
    process.env.VERCEL_ENV === "production" && secret
      ? previewKickTargets(await dueScopedRuns(service), {
          now: Date.now(),
          staleAfterMs: PREVIEW_STALE_AFTER_MS,
        })
      : { urls: [], stalledRunIds: [] };

  const chain = Number(request.nextUrl.searchParams.get("chain") ?? "0") || 0;
  if (summary.claimed > 0 || dispatch.urls.length > 0 || dispatch.stalledRunIds.length > 0) {
    after(async () => {
      if (summary.claimed > 0) {
        await chainAgentDrain({ supabase: service, chain, origin: request.nextUrl.origin });
      }
      if (secret) await Promise.all(dispatch.urls.map((url) => kickDeployment(url, secret)));
      await failStalledRuns(service, dispatch.stalledRunIds);
    });
  }

  return NextResponse.json({
    ok: true,
    claimed: summary.claimed,
    kicked: dispatch.urls.length,
    stalled: dispatch.stalledRunIds.length,
  });
}

export const GET = handle;
export const POST = handle;
