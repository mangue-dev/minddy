import type { PullRequestReadiness } from "@/lib/pr-readiness";

/** The CI line of a pull request's hover card (MIN-888). */
export interface PrPreviewChecks {
  status: "passed" | "running" | "failed";
  /** Checks running or failed; for `passed`, the required checks. 0 when the
      forge did not count them. */
  count: number;
  /** The checks running or failed, as the forge names them. */
  names: string[];
}

/**
 * Reads the CI line from the readiness the board already computes, so the
 * card costs no extra forge read. Running checks win over failed ones, as in
 * `reducePullRequestReadiness`: a suite still running is never shown as final.
 * `null` when there is nothing true to say: a merged or closed pull request,
 * or checks the forge would not give.
 */
export function prPreviewChecks(readiness: PullRequestReadiness | null | undefined): PrPreviewChecks | null {
  if (!readiness || readiness.state === "merged" || readiness.state === "closed") return null;
  const blockers = readiness.blockers.filter((blocker) => blocker.kind === "checks");
  const running = blockers.find((blocker) => blocker.status === "pending");
  if (running) return { status: "running", count: running.count ?? 0, names: running.checkNames ?? [] };
  const failed = blockers.find((blocker) => blocker.status === "blocked");
  if (failed) return { status: "failed", count: failed.count ?? 0, names: failed.checkNames ?? [] };
  const passed = readiness.passed.find((condition) => condition.kind === "checks");
  if (passed) return { status: "passed", count: passed.count ?? 0, names: [] };
  return null;
}
