import { supabaseServerFetch } from "@/lib/server/supabase-fetch";
import "server-only";

/**
 * LIVE broadcast of a Code Agent session, on the private topic
 * `agent-run:{runId}` (migration 20260908090000_agent_live_stream).
 *
 * Agent run content is stored in an encrypted current snapshot. Realtime
 * carries only an event invalidation; readers use authorized routes.
 *
 * `event` — an invalidation with only the event ID and type. The authorized
 * event route reads and decrypts the source row.
 *
 * The SQL RPC resolves the membership generation and rejects old content
 * broadcasts before they can reach a durable Realtime partition.
 *
 * EVERYTHING is best-effort: a failed broadcast should never cause a run
 * to fail (polling the thread makes up for what is missing).
 */

export function agentRunTopic(runId: string): string {
  return `agent-run:${runId}`;
}

/**
 * Send a content-free invalidation to a logical private topic.
 *
 * `changed` is the pull request invalidation
 * (`pull-request:{id}`, MIN-161): it does not transport content, only
 * the parts which have moved — the content of a PR is read at the forge, with the
 * token of HE WHO WATCHES (see lib/pr-live.ts).
 */
export async function broadcastToTopic(
  topic: string,
  event: "event" | "changed",
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.MINDDY_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  if (topic.startsWith("agent-run:") &&
      (event !== "event" ||
       typeof payload.id !== "string" ||
       typeof payload.type !== "string")) return;
  const safePayload = topic.startsWith("agent-run:")
    ? { id: payload.id, type: payload.type } : payload;
  try {
    await supabaseServerFetch(`${url}/rest/v1/rpc/broadcast_private_realtime`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_topic: topic,
        p_event: event,
        p_payload: safePayload,
      }),
    });
  } catch {
    // The thread polls every 2 s: at worst, the screen has a delay.
  }
}

/** Notify subscribers to fetch a newly inserted event through the authorized route. */
export function broadcastRunEvent(
  runId: string,
  row: { id: string; type: string },
): void {
  void broadcastToTopic(agentRunTopic(runId), "event", {
    id: row.id, type: row.type,
  });
}
