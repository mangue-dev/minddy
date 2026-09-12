/**
 * A failed run is resumable only when a durable checkpoint survived the
 * failure. Historical desktop-local runs are never resumed because their
 * checkpoint and uncommitted checkout state are not portable to a server
 * sandbox.
 */
export function agentRunCanResume(run: {
  status: string;
  checkpoint: unknown;
  local_exec?: boolean | null;
}): boolean {
  if (run.local_exec === true) return false;
  return run.status !== "failed" || run.checkpoint != null;
}
