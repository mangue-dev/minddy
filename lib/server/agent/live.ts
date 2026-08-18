import "server-only";

import type { AgentLiveEdit, AgentLiveFileStat } from "./agent-contract";

/**
 * LIVE broadcast of a Code Agent session, on the private topic
 * `agent-run:{runId}` (migration 20260908090000_agent_live_stream).
 *
 * Two messages, both EPHEMERAL — nothing is written in base by this module:
 *
 * `stream` — the text of the current round, re-emitted while the model writes.
 * This is what gives the agent thread the streamed rendering of Numo.
 * `event` — the line `agent_run_events` which has just been inserted, pushed
 * as is (appendEvent) so that the thread displays it immediately
 * instead of waiting for its poll.
 *
 * We type the Realtime HTTP endpoint rather than opening a websocket: the
 * loop runs in a serverless function that can be cut at any time,
 * and a stateless POST lends itself to this better than a maintainable connection. The key of
 * service authorizes broadcast on a private topic.
 *
 * EVERYTHING is best-effort: a failed broadcast should never cause a run
 * to fail (polling the thread makes up for what is missing).
 */

export function agentRunTopic(runId: string): string {
  return `agent-run:${runId}`;
}

/** Live payload: the COMPLETE state of the current round, not a delta —
 * a lost message is therefore made up for in the next one, without a gap in the text. */
export interface AgentLiveStream {
  /** Model response as written so far. */
  text: string;
  /** Number of tool calls already initiated in this round: >0 ⇒ this text is from
 * the narration (the round continues), 0 ⇒ this is perhaps the final answer. */
  tools: number;
  /** The model is reasoning AT THIS MOMENT (MIN-122) → indicator + counter in the thread.
 * The TEXT of the reasoning does not go through here: it is not streamed, it is
 * persisted folded at the end of the round. */
  reasoningActive: boolean;
  /** Milliseconds of reflection accumulated in this round (feeds the counter). */
  reasoningMs: number;
  /** Transmission timestamp (ms). The client throws what arrives out of order.
 * A counter would not be suitable: a restarted run starts again from another
 * invocation, therefore from a counter reset to zero. */
  at: number;
  /** Files touched so far by the round, provisional: carried by EACH
 * load, otherwise the thread erases them on the next load. */
  files?: AgentLiveEdit[];
  /** The list has been limited to `CHANGED_FILES_CAP`. */
  filesTruncated?: boolean;
  /** Exact Git counters for the current round (especially for local runs). */
  fileStats?: AgentLiveFileStat[];
}

/**
 * Raw sending to a private topic. Taken out of the function below to serve
 * also the review of a PR (`pr-review:{id}`), which broadcasts the same pair
 * `stream`/`event` on its own topic: the transport does not depend on what
 * is broadcast, only the topic change.
 *
 * `changed` is the third, for the direct pull request
 * (`pull-request:{id}`, MIN-161): it does not transport content, only
 * the parts which have moved — the content of a PR is read at the forge, with the
 * token of HE WHO WATCHES (see lib/pr-live.ts).
 */
export async function broadcastToTopic(
  topic: string,
  event: "stream" | "event" | "changed" | "diff",
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload, private: true }],
      }),
    });
  } catch {
    // The thread polls every 2 s: at worst, the screen has a delay.
  }
}

async function broadcast(
  runId: string,
  event: "stream" | "event",
  payload: Record<string, unknown>,
): Promise<void> {
  await broadcastToTopic(agentRunTopic(runId), event, payload);
}

/** Text of the current round. Called at the rate of the LLM stream (throttled upstream). */
export function broadcastRunStream(runId: string, live: AgentLiveStream): void {
  void broadcast(runId, "stream", { ...live });
}

/** Freshly inserted vent line, pushed as is to the open wire. */
export function broadcastRunEvent(
  runId: string,
  row: { id: string; seq: number; type: string; payload: unknown; created_at: string },
): void {
  void broadcast(runId, "event", { row });
}
