import { fetchAgentRunEventsApi, type AgentRunEvent } from "./agent-api";

export type AgentEventsData = { events: AgentRunEvent[]; reconciledAt: number };
const RECONCILE_MS = 30_000;

/** Keep the live cadence while transferring only newly appended events. */
export async function readAgentEvents(
  runId: string,
  cached: AgentEventsData | undefined,
  options: { full?: boolean; signal?: AbortSignal; now?: number } = {},
): Promise<AgentEventsData> {
  const now = options.now ?? Date.now();
  // Full reads also repair late commits, corrections and retention deletions.
  const full = options.full || !cached?.reconciledAt || now - cached.reconciledAt >= RECONCILE_MS;
  // The first event has sequence zero. An empty history has no cursor yet.
  const after = full || !cached!.events.length ? undefined
    : cached!.events.reduce((seq, event) => Math.max(seq, event.seq), -1);
  const result = await fetchAgentRunEventsApi(runId, after, options.signal);
  if (full) return { events: result.events, reconciledAt: now };
  const events = new Map(cached!.events.map(event => [event.id, event]));
  for (const event of result.events) events.set(event.id, event);
  return {
    events: [...events.values()].sort((a, b) => a.seq - b.seq),
    reconciledAt: cached!.reconciledAt,
  };
}
