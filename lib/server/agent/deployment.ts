/**
 * Agent runs deployment affinity (MIN-165). PURE and testable — like
 * deployment policy here, with execution in `drain.ts` and the cron route.
 *
 * Preview and production share a single database, hence a single queue of runs. The
 * drain claim any run `queued` and the cron only runs in prod: a run
 * launched from a preview leaves, at the first chunk boundary, on the code of
 * the prod — same checkpoint, same microVM, different set of tools. The remedy is
 * a BUFFER set at creation: each drain only claims its own perimeter,
 * and the prod cron just wakes up the deployments that have work to do.
 */

/** Number of preview deployments woken up per cron tick. The remainder waits for
 * the next tick (2 min) — the number of previews that drain AT THE SAME TIME is counted on one hand, and the cap keeps the distributor bounded. */
export const PREVIEW_KICK_MAX_TARGETS = 5;

/** Beyond that, a run preview due and never resumed is declared an orphan: its
 * deployment has been deleted, or no longer responds. Large in front of the 2 min of the cron
 * and in front of a chunk of 13 min which would have missed its own chaining. */
export const PREVIEW_STALE_AFTER_MS = 15 * 60_000;

/**
 * Deployment drain scope described by `env`.
 *
 * `null` = the common queue, drained by the prod cron: production, and the local
 * (no `VERCEL_ENV`), whose drain launched from the workstation must continue
 * to resume prod runs — this is the launch recipe in effect.
 *
 * Otherwise the URL of the EXACT deployment (`VERCEL_URL`) and not that of the branch: a
 * run continues with the code that launched it, even if the branch is pushed back between
 * two chunks.
 */
export function deploymentScopeFromEnv(
  env: Record<string, string | undefined>,
): string | null {
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (!vercelEnv || vercelEnv === "production") return null;
  return env.VERCEL_URL?.trim() || null;
}

/** `deploymentScopeFromEnv` applied to the current process. */
export function currentDeploymentScope(): string | null {
  return deploymentScopeFromEnv(process.env);
}

/** Queue line read by the dispatcher (see the cron route). */
export interface QueuedRunRow {
  id: string;
  deployment_url: string | null;
  not_before: string;
}

/**
 * Distribution of a prod cron tick: the deployments to wake up, and the
 * runs whose deployment is no longer responding.
 *
 * An orphaned run does NOT count for its URL: waking up a deleted deployment
 * achieves nothing. Another recent run on the same URL will be kicked —
 * this is what distinguishes a dead deployment from an isolated run that missed its turn.
 */
export function previewKickTargets(
  rows: QueuedRunRow[],
  opts: { now: number; staleAfterMs: number },
): { urls: string[]; stalledRunIds: string[] } {
  const urls: string[] = [];
  const seen = new Set<string>();
  const stalledRunIds: string[] = [];
  for (const row of rows) {
    const url = row.deployment_url?.trim();
    if (!url) continue; // run of the common queue — the prod has just drained it
    const dueAt = Date.parse(row.not_before);
    // `not_before` illegible: we wake up, we do not condemn. Declare an orphan
    // destroy a run; getting it wrong only costs one POST.
    if (Number.isFinite(dueAt) && opts.now - dueAt > opts.staleAfterMs) {
      stalledRunIds.push(row.id);
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return { urls: urls.slice(0, PREVIEW_KICK_MAX_TARGETS), stalledRunIds };
}
