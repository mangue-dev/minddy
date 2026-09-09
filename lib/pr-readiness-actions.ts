import type { AgentRunPrResponse, PullRequestCheck } from "./agent-api";
import type { PullRequestReadiness, ReadinessBlocker } from "./pr-readiness";
import type { PullRequestReadinessBatchResponse } from "./agent-api";

export type PullRequestDetailTab = "activity" | "commits" | "files";
type RerunnableCheck = PullRequestCheck & {
  rerunRef: NonNullable<PullRequestCheck["rerunRef"]>;
};

export const PULL_REQUEST_POLL_MS = 15_000;
export const PULL_REQUEST_READINESS_SETTLED_POLL_MS = 60_000;

export function pullRequestRefetchInterval(
  response: AgentRunPrResponse | undefined,
): number | false {
  if (response?.checks?.state === "pending") return PULL_REQUEST_POLL_MS;
  if (
    response?.readiness?.blockers.some(
      (blocker) => blocker.id === "mergeability-unavailable",
    )
  ) {
    return PULL_REQUEST_POLL_MS;
  }
  return false;
}

export function pullRequestReadinessRefetchInterval(
  readiness: PullRequestReadiness | undefined,
): number | false {
  if (readiness?.state === "checks_running") return PULL_REQUEST_POLL_MS;
  if (
    readiness?.blockers.some(
      (blocker) => blocker.id === "mergeability-unavailable",
    )
  ) {
    return PULL_REQUEST_POLL_MS;
  }
  return false;
}

export function pullRequestReadinessBatchRefetchInterval(
  response: PullRequestReadinessBatchResponse | undefined,
  queryErrored = false,
): number | false {
  if (queryErrored) return PULL_REQUEST_READINESS_SETTLED_POLL_MS;
  if (!response) return false;
  const states = Object.values(response.readiness).map((item) => item.state);
  if (states.some((state) => state === "checks_running" || state === "status_unavailable")) {
    return PULL_REQUEST_POLL_MS;
  }
  return PULL_REQUEST_READINESS_SETTLED_POLL_MS;
}

export function findRerunnableChecks(
  checks: PullRequestCheck[] | null | undefined,
  blocker: ReadinessBlocker,
): RerunnableCheck[] {
  const failed = (checks ?? []).filter(
    (check): check is RerunnableCheck =>
      check.state === "failure" && check.rerunRef != null,
  );
  const blockerNames = new Set(blocker.checkNames ?? []);
  const eligible =
    blockerNames.size > 0
      ? failed.filter((check) => blockerNames.has(check.name))
      : failed.filter((check) => check.required !== false);
  const seen = new Set<string>();
  return eligible.filter((check) => {
    const ref = check.rerunRef;
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
