/**
 * A failed run is resumable only when a durable checkpoint survived the
 * failure. Every other run status keeps the existing conversational behavior.
 */
export function agentRunCanResume(run: {
  status: string;
  checkpoint: unknown;
}): boolean {
  return run.status !== "failed" || run.checkpoint != null;
}
