"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

type TopicClient = Pick<SupabaseClient, "rpc">;
type RekeyListener = () => void;

const rekeyListeners = new Set<RekeyListener>();
let rekeyPending = false;

/** Resolve a private logical topic to the current membership generation. */
export async function resolveRealtimeTopic(
  client: TopicClient,
  topic: string,
): Promise<string> {
  const { data, error } = await client.rpc("resolve_realtime_topic", {
    p_topic: topic,
  });
  if (error) throw error;
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("Realtime topic resolution returned no topic");
  }
  return data;
}

/** Reconnect every open private channel after any project membership change. */
export function onRealtimeRekey(listener: RekeyListener): () => void {
  rekeyListeners.add(listener);
  return () => rekeyListeners.delete(listener);
}

/** Coalesce the project and personal copies of the same rekey signal. */
export function signalRealtimeRekey(): void {
  if (rekeyPending) return;
  rekeyPending = true;
  queueMicrotask(() => {
    rekeyPending = false;
    for (const listener of rekeyListeners) listener();
  });
}
