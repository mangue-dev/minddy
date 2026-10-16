import { supabaseServerFetch } from "@/lib/server/supabase-fetch";
import "server-only";

/**
 * Content-free invalidation sent to a logical private Realtime topic.
 *
 * `changed` is the pull request invalidation (`pull-request:{id}`, MIN-161):
 * it carries only the parts that moved. The content of a pull request is read
 * at the forge with the token of the viewer (see lib/pr-live.ts).
 *
 * The SQL RPC resolves the membership generation before the broadcast reaches
 * a durable Realtime partition. Everything is best-effort: a failed broadcast
 * only delays the screen until its next refresh.
 */
export async function broadcastToTopic(
  topic: string,
  event: "changed",
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.MINDDY_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
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
        p_payload: payload,
      }),
    });
  } catch {
    // Best-effort: the next refresh makes up for a missed invalidation.
  }
}
