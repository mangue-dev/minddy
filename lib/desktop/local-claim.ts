import type { LocalRepoStore } from "./local-repo";

/** Le pull reste léger au repos, mais reprend vite après un message distant. */
export const LOCAL_CLAIM_IDLE_DELAY_MS = 2_000;
export const LOCAL_CLAIM_RETRY_DELAY_MS = 15_000;
export const LOCAL_CLAIM_REFUSED_DELAY_MS = 5_000;
export const LOCAL_CLAIM_MAX_PROJECTS = 50;

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LocalClaimOutcome = "claimed" | "idle" | "refused" | "unavailable";

/**
 * Seuls les identifiants montent au serveur. Les chemins restent dans
 * `userData/repos.json`, sur la machine à laquelle ils appartiennent.
 */
export function localClaimProjectIds(store: LocalRepoStore): string[] {
  return Object.keys(store)
    .filter((id) => PROJECT_ID.test(id))
    .sort()
    .slice(0, LOCAL_CLAIM_MAX_PROJECTS);
}

/** Un claim gagné enchaîne tout de suite pour ne pas sérialiser deux runs. */
export function nextLocalClaimDelay(outcome: LocalClaimOutcome): number {
  if (outcome === "claimed") return 0;
  if (outcome === "idle") return LOCAL_CLAIM_IDLE_DELAY_MS;
  if (outcome === "refused") return LOCAL_CLAIM_REFUSED_DELAY_MS;
  return LOCAL_CLAIM_RETRY_DELAY_MS;
}
