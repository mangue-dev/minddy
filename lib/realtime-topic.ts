"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BACKEND_REQUEST_TIMEOUT_MS } from "./backend-availability";
import { withClientRequestDeadline } from "./client-request-deadline";

type TopicClient = Pick<SupabaseClient, "rpc">;
type RekeyListener = () => void;

const rekeyListeners = new Set<RekeyListener>();
let rekeyPending = false;
const revalidateListeners = new Set<RekeyListener>();
let revalidatePending = false;

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

/**
 * Re-check open private channels after an absence, in case a rekey broadcast
 * was missed. Unlike a rekey, a listener keeps a channel that is still joined
 * on the current generation: leaving it would open the very gap a second
 * catch-up then has to close.
 */
export function onRealtimeRevalidate(listener: RekeyListener): () => void {
  revalidateListeners.add(listener);
  return () => revalidateListeners.delete(listener);
}

/** Coalesce the resume signals of one wake into one revalidation. */
export function signalRealtimeRevalidate(): void {
  if (revalidatePending) return;
  revalidatePending = true;
  queueMicrotask(() => {
    revalidatePending = false;
    for (const listener of revalidateListeners) listener();
  });
}

/**
 * Whether a channel can stay as it is: joined, and its logical topic still
 * resolves to the generation it joined. Any doubt (not joined, a denial, a
 * failed or stalled resolution) answers false, so the caller reconnects.
 */
export async function isCurrentRealtimeTopic(
  client: TopicClient,
  topic: string,
  resolvedTopic: string | null,
  channel: { state: string } | null,
): Promise<boolean> {
  if (!resolvedTopic || channel?.state !== "joined") return false;
  try {
    const current = await withClientRequestDeadline(
      () => resolveRealtimeTopic(client, topic),
      BACKEND_REQUEST_TIMEOUT_MS,
    );
    return current === resolvedTopic;
  } catch {
    return false;
  }
}

/**
 * Reconnect a private channel on every rekey, and on a revalidation only when
 * it is no longer joined on the current generation of `topic`. `current` is
 * read again after the check, so a reconnect that happened meanwhile wins.
 */
export function watchRealtimeTopic(
  client: TopicClient,
  topic: string,
  current: () => { resolved: string | null; channel: { state: string } | null; version: number },
  reconnect: () => void,
): () => void {
  const stopRekey = onRealtimeRekey(reconnect);
  const stopRevalidate = onRealtimeRevalidate(() => {
    const { resolved, channel, version } = current();
    void isCurrentRealtimeTopic(client, topic, resolved, channel).then((joined) => {
      if (!joined && current().version === version) reconnect();
    });
  });
  return () => {
    stopRekey();
    stopRevalidate();
  };
}
