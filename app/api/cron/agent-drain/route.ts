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
 * LAUNCHER of agent runs (MIN-46, reduced to this profession in MIN-225). He doesn't
 * DRAINE more in the sense of executing: it claims the runs due and launches their microVM,
 * who then lives his life and gives his own report. A passage is therefore counted in
 * seconds per run, not in minutes — hence the disappearance of chaining, which
 * only existed to catch up with the remainder of a window eaten by a chunk.
 * Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}`; without this
 * secret, the route returns 401.
 *
 * In PRODUCTION, this handler is also the DISTRIBUTOR of preview runs (MIN-165):
 * its drain only claims the common queue, and it wakes up with a POST the
 * deployments that have work due — without ever executing it. This is what makes
 * the safety net compatible with a branch test: the cron remains on,
 * he no longer mixes codes.
 */

export const runtime = "nodejs";
/**
 * 300 s — the default, and it is more than enough since MIN-225.
 *
 * This route has long carried 800 s (the maximum of the Pro plan under Fluid) because
 * that she PERFORMED a thirteen minute chunk. She just throws:
 * wake up or clone the microVM, write the job, detach command. The post
 * heavier is the clone of a cold deposit (~22 s measured, MIN-222), and the turn
 * itself takes place elsewhere, with no function clock above it.
 *
 * Keeping 800 s would cost nothing (Fluid charges the Active CPU) but
 * would lie about what this handler does - and it is this lie that made
 * size everything else in “chunks”.
 */
export const maxDuration = 300;
/** Launch budget, under `maxDuration` above (room for response). */
const CRON_DRAIN_BUDGET_MS = 270_000;

/**
 * Runs preview due, read in prod for distribution. Wide ceiling in front of
 * ceiling of wake-ups: it is `previewKickTargets` which decides, not the SELECT.
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

/** Wakes A deployment preview. Best effort: production never executes these
 * runs, she rings the doorbell. */
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
      // As in `chainAgentDrain`: the request is delivered, the child drains.
      console.log("[agent-drain] preview kick sent (timeout):", url);
      return;
    }
    console.error("[agent-drain] preview kick failed:", url, error);
  }
}

/**
 * Dead deployment: the run will NEVER be resumed (the preview has been deleted, or
 * no longer responds). Without this output, his conversation remains `queued` for
 * always. CASE on `status`: a run resumed in the meantime is not affected.
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
    .select("id, created_by, project_id, issue_id, conversation_id");
  if (error) {
    console.error("[agent-drain] stalled preview fail failed:", error.message);
    return;
  }
  const rows = (data ?? []) as Array<{
    created_by: string | null;
    project_id: string;
    issue_id: string | null;
    conversation_id: string;
  }>;
  for (const row of rows) await notifyAgentRun(row, "agent_failed");
}

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = getServiceClient();
  const summary = await drainAgentRuns(service, { budgetMs: CRON_DRAIN_BUDGET_MS });

  // Distribution (MIN-165): only the PROD wakes up the other deployments. A
  // kicked preview arrives here with VERCEL_ENV=preview and only does its drain —
  // otherwise two deployments would pass the buck indefinitely.
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
