import { isAgentRunWorking, type AgentRunEvent, type AgentRunSummary } from "./agent-api";

type TimingRun = Pick<AgentRunSummary, "status" | "awaiting_input" | "started_at" | "created_at" | "completed_at" | "updated_at">;

/** Accumulate execution intervals without resetting on continuation or counting input waits. */
export function delegatedWorkDurationMs(run: TimingRun, events: readonly AgentRunEvent[], now: number): number {
  let total = 0;
  let start: number | null = null;
  let sawStart = false;
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.payload?.subagent_id) continue;
    const time = Date.parse(event.created_at);
    if (!Number.isFinite(time)) continue;
    if (event.type === "status" && event.payload?.status === "running") {
      start ??= time;
      sawStart = true;
    }
    if ((["summary", "question", "needs_input", "quota_exhausted", "error"].includes(event.type)
      || (event.type === "status" && ["completed", "failed", "canceled"].includes(String(event.payload?.status)))) && start !== null) {
      total += Math.max(0, time - start);
      start = null;
    }
  }
  const active = isAgentRunWorking(run.status) && !run.awaiting_input;
  const end = active ? now : Date.parse(run.completed_at ?? run.updated_at);
  if (start !== null) total += Math.max(0, (Number.isFinite(end) ? end : start) - start);
  if (!sawStart) {
    const fallback = Date.parse(run.started_at ?? "");
    total = Number.isFinite(fallback) && Number.isFinite(end) ? Math.max(0, end - fallback) : 0;
  }
  return total;
}
