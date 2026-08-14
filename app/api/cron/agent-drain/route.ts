import { NextResponse, after, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyCronSecret } from "@/lib/server/cron-auth";

import { getServiceClient } from "@/lib/supabase-service";
import { drainAgentRuns } from "@/lib/server/agent/drain";
import {
  previewKickTargets,
  PREVIEW_STALE_AFTER_MS,
  type QueuedRunRow,
} from "@/lib/server/agent/deployment";
import { notifyAgentRun } from "@/lib/server/agent/runs";

/**
 * LANCEUR des runs de l'agent (MIN-46, réduit à ce métier en MIN-225). Il ne
 * DRAINE plus au sens d'exécuter : il claim les runs dus et lance leur microVM,
 * qui vit sa vie ensuite et rend son propre rapport. Un passage se compte donc en
 * secondes par run, pas en minutes — d'où la disparition du chaînage, qui
 * n'existait que pour rattraper le reliquat d'une fenêtre mangée par un chunk.
 * Vercel envoie automatiquement `Authorization: Bearer ${CRON_SECRET}` ; sans ce
 * secret, la route est 401.
 *
 * En PRODUCTION, ce handler est aussi le RÉPARTITEUR des runs preview (MIN-165) :
 * son drain ne claim plus que la file commune, et il réveille par un POST les
 * déploiements qui ont du travail dû — sans jamais l'exécuter. C'est ce qui rend
 * le filet de sécurité compatible avec un test de branche : le cron reste allumé,
 * il ne mélange plus les codes.
 */

export const runtime = "nodejs";
/**
 * 300 s — le défaut, et il suffit largement depuis MIN-225.
 *
 * Cette route a longtemps porté 800 s (le maximum du plan Pro sous Fluid) parce
 * qu'elle EXÉCUTAIT un chunk de treize minutes. Elle ne fait plus que lancer :
 * réveil ou clone de la microVM, écriture du job, commande détachée. Le poste le
 * plus lourd est le clone d'un dépôt froid (~22 s mesurées, MIN-222), et le tour
 * lui-même se déroule ailleurs, sans horloge de fonction au-dessus de lui.
 *
 * Garder 800 s ne coûterait rien en facture (Fluid facture l'Active CPU) mais
 * mentirait sur ce que fait ce handler — et c'est ce mensonge-là qui a fait
 * dimensionner tout le reste en « chunks ».
 */
export const maxDuration = 300;
/** Budget du lancement, sous le `maxDuration` ci-dessus (marge pour la réponse). */
const CRON_DRAIN_BUDGET_MS = 270_000;

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

  if (dispatch.urls.length > 0 || dispatch.stalledRunIds.length > 0) {
    after(async () => {
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
