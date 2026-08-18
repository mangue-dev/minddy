import type { LocalRepoStore } from "./local-repo";

/** The sweater remains light when resting, but quickly resumes after a distant message. */
export const LOCAL_CLAIM_IDLE_DELAY_MS = 2_000;
export const LOCAL_CLAIM_RETRY_DELAY_MS = 15_000;
export const LOCAL_CLAIM_REFUSED_DELAY_MS = 5_000;
export const LOCAL_CLAIM_MAX_PROJECTS = 50;

const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LocalClaimOutcome = "claimed" | "idle" | "refused" | "unavailable";

/**
 * Only identifiers go up to the server. Paths remain in
 * `userData/repos.json`, on the machine they belong to.
 */
export function localClaimProjectIds(store: LocalRepoStore): string[] {
  return Object.keys(store)
    .filter((id) => PROJECT_ID.test(id))
    .sort()
    .slice(0, LOCAL_CLAIM_MAX_PROJECTS);
}

/** A claim won immediately follows so as not to serialize two runs. */
export function nextLocalClaimDelay(outcome: LocalClaimOutcome): number {
  if (outcome === "claimed") return 0;
  if (outcome === "idle") return LOCAL_CLAIM_IDLE_DELAY_MS;
  if (outcome === "refused") return LOCAL_CLAIM_REFUSED_DELAY_MS;
  return LOCAL_CLAIM_RETRY_DELAY_MS;
}
