import type { AgentRunPrResponse, PullRequestCheck } from "./agent-api";
import type { ReadinessBlocker } from "./pr-readiness";
import type { RepoProviderId } from "./repo-providers";

export type PullRequestDetailTab = "activity" | "commits" | "files";
type RerunnableCheck = PullRequestCheck & {
  rerunRef: NonNullable<PullRequestCheck["rerunRef"]>;
};

export const PULL_REQUEST_POLL_MS = 15_000;

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

export function conversationResolutionTab(
  provider: RepoProviderId,
): PullRequestDetailTab {
  return provider === "gitlab" ? "files" : "activity";
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
