import "server-only";

import os from "node:os";

import { getAppConfigValue } from "@/lib/server/app-config";
import {
  DEFAULT_SUBAGENT_FAVORITES,
  parseSubagentFavorites,
  type FavoriteSubagentModel,
} from "@/lib/subagent-favorites";

/**
 * The TWO subagent settings that read in base (MIN-112) — the favorites list and the parallelism cap.
 *
 * Separated from [subagent-config.ts](subagent-config.ts) by MIN-224: this is
 * imported by the loop, which is now running in the microVM, and a module that
 * the loop imports must not be able to reach the Supabase client in key of
 * service. These two functions are therefore read BEFORE, on the function side, and their
 * results go down to the job of the turn.
 *
 * Both go through `app_config`, NOT through the env — same mechanics as
 * `agent_model` (`getAppConfigValue`, 60 s cache): adjustable without deployment.
 */

/** Calculated ceiling limits. A single sub-agent would be of no use; beyond
 * six, it is no longer the VM which limits but the provider (429) and the sandbox. */
const MIN_PARALLEL = 2;
const MAX_PARALLEL = 6;

/** Key `app_config` of the favorites list (JSON: array of FavoriteSubagentModel). */
export const SUBAGENT_FAVORITES_CONFIG_KEY = "agent_subagent_favorites";
/** Concurrent subagent cap `app_config` key (integer). */
export const SUBAGENT_MAX_PARALLEL_CONFIG_KEY = "agent_subagent_max_parallel";

/**
 * Favorites served to the parent's system prompt. Overloadable by `app_config` ;
 * an unreadable JSON, an empty array or a list with no valid entries
 * falls back — the run keeps a usable list in all cases.
 */
export async function getSubagentFavorites(): Promise<FavoriteSubagentModel[]> {
  const raw = await getAppConfigValue(SUBAGENT_FAVORITES_CONFIG_KEY).catch(() => null);
  const favorites = parseSubagentFavorites(raw);
  if (!favorites && raw?.trim()) {
    console.error(`[subagent-app-config] ${SUBAGENT_FAVORITES_CONFIG_KEY} is unusable, using defaults`);
  }
  return favorites ?? DEFAULT_SUBAGENT_FAVORITES;
}

/**
 * Ceiling of SIMULTANEOUS subagents, calculated at launch according to the resources of
 * the VM (`os.availableParallelism()` — the vCPUs actually usable), limited to
 * [2, 6], overloadable by `app_config`.
 *
 * Honest comment on what this math is worth: a subagent is I/O-BOUND (some LLM calls and round trips to the sandbox, almost no local CPU), so
 * vCPUs are just a PROXY — they tell the size of the machine, not how many girls it has can feed. The real bottlenecks are elsewhere, and both have already been dealt with: the shared sandbox (a single writer, cf. `Subagents`) and the 429 from the
 * provider (taken over by `streamCompletion`). Hence the tight bounds: the calculation
 * avoids stacking twenty girls on a small VM, it does not pretend to dimension.
 */
export async function maxParallelSubagents(): Promise<number> {
  const configured = await getAppConfigValue(SUBAGENT_MAX_PARALLEL_CONFIG_KEY).catch(() => null);
  if (configured?.trim()) {
    const n = Number.parseInt(configured.trim(), 10);
    if (Number.isInteger(n) && n >= 1) return Math.min(n, 32);
  }
  const cpus =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : (os.cpus()?.length ?? MIN_PARALLEL);
  return Math.min(MAX_PARALLEL, Math.max(MIN_PARALLEL, cpus));
}
