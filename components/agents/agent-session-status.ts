import type { MessageKey } from "@/lib/i18n-keys";
import type { AgentRunStatus } from "@/lib/agent-api";

/**
 * The status of an agent session, in ONE word — the one displayed in the agent session tooltip.
 * list (Agents page). It does not say “finished”: it reflects the GENERATION in
 * course, then the STATUS OF THE PULL REQUEST. Priority :
 * 1. generation in progress → “In progress”;
 * 2. Merged PR → “Merged PR”;
 * 3. PR open (or draft, or unknown state) → “PR available”;
 * 4. PR closed → “PR closed”;
 * 5. otherwise (no PR) → fail/cancel/at rest.
 *
 * It was a colorful BADGE placed on each line of the list. The line does not carry
 * more than its title: the state is reduced to the point of color (unread / response
 * expected) and to the spinner, and the exact word waits for hover.
 */
export function agentSessionStatusKey({
  status,
  working,
  prNumber,
  prState,
}: {
  status: AgentRunStatus;
  working?: boolean;
  prNumber?: number | null;
  prState?: "draft" | "open" | "merged" | "closed" | null;
}): MessageKey<"Agents"> {
  const isWorking = working ?? (status === "queued" || status === "running");
  if (isWorking) return "statusWorking";
  if (prState === "merged") return "prMergedShort";
  if (prNumber != null && prState !== "closed") return "prAvailable";
  if (prState === "closed") return "prClosed";
  if (status === "failed") return "statusFailed";
  if (status === "canceled") return "statusCanceled";
  return "statusWaiting";
}
