"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { AgentRunEvent } from "./agent-api";
import { liveAfterEvent, liveFromStream, type AgentRunLive, type StreamPayload } from "./agent-live";
import { parseAgentLocalDiff, type AgentLocalDiff } from "./agent-local-diff";

export type { AgentRunLive } from "./agent-live";

/**
 * The thread of a LIVE code agent session (private topic
 * `agent-run:{runId}`, migration 20260908090000_agent_live_stream).
 *
 * Numo streams because its thread holds the SSE connection of the route which does
 * loop. The code agent cannot: its loop runs as a
 * task in the background, without a browser at the end. The server therefore broadcasts two things on the topic
 * of the run (lib/server/agent/live.ts), and this is where we receive them:
 *
 * `stream` — the text of the current round, ~4 times per second. Rendered as
 * live tail of the thread, then replaced with the real message. Carries
 * also the REFLECTION state (MIN-122) — a flag and a timer,
 * never the text of the reasoning: this is not streamed.
 * `event` — a freshly inserted `agent_run_events` line, pushed
 * directly in the thread cache: the tool-calls and the response
 * appear instantly instead of waiting for the poll.
 *
 * The polling of `useAgentRunEventsQuery` remains in place: it's the net (message
 * lost, sleeping tab, subscription not yet attached).
 */

interface Listener {
  onStream?: (payload: StreamPayload) => void;
  onEvent?: (row: AgentRunEvent) => void;
  onDiff?: (diff: AgentLocalDiff) => void;
}

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  /** Last subscriber left during opening → do not contact afterwards. */
  closed: boolean;
}

/**
 * ONE channel per run, regardless of the number of threads mounted on it: two views of the
 * same run coexist (the modal of a ticket above the Agents page), and one
 * same socket cannot join the same topic twice.
 */
const channels = new Map<string, Entry>();

function subscribeRun(runId: string, listener: Listener): () => void {
  let entry = channels.get(runId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), closed: false };
    entry = fresh;
    channels.set(runId, fresh);
    const supabase = getSupabase();
    // Same precaution as the RealtimeProvider: push the token BEFORE the join,
    // otherwise the private channel refuses the subscription (anon token).
    void supabase.realtime.setAuth().then(() => {
      if (fresh.closed) return;
      const channel = supabase.channel(`agent-run:${runId}`, {
        config: { private: true },
      });
      channel.on("broadcast", { event: "stream" }, ({ payload }) => {
        for (const l of fresh.listeners) l.onStream?.((payload ?? {}) as StreamPayload);
      });
      channel.on("broadcast", { event: "event" }, ({ payload }) => {
        const row = (payload as { row?: AgentRunEvent } | null)?.row;
        if (!row?.id) return;
        for (const l of fresh.listeners) l.onEvent?.(row);
      });
      channel.on("broadcast", { event: "diff" }, ({ payload }) => {
        const diff = parseAgentLocalDiff(payload);
        for (const l of fresh.listeners) l.onDiff?.(diff);
      });
      channel.subscribe();
      fresh.channel = channel;
    });
  }
  entry.listeners.add(listener);

  const opened = entry;
  return () => {
    opened.listeners.delete(listener);
    if (opened.listeners.size > 0) return;
    opened.closed = true;
    channels.delete(runId);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

/** Patch produced on the machine during the round. It shares the same
 * Realtime subscription as the feed, but remains separate from the text stream so as not to be
 * retransmitted four times per second. When idle, the persistent event takes over. */
export function useAgentRunLocalDiff(
  runId: string | null,
  active: boolean,
): AgentLocalDiff | null {
  const [diff, setDiff] = useState<AgentLocalDiff | null>(null);

  useEffect(() => {
    setDiff(null);
    if (!runId || !active) return;
    return subscribeRun(runId, {
      onDiff: (next) => {
        // The relay already validates the shape; the order is carried by the wrapper
        //Realtime. Two successive readings are complete snapshots.
        setDiff(next);
      },
    });
  }, [runId, active]);

  return diff;
}

/**
 * `active` = the agent is working. When idle, we do not subscribe: there is nothing to broadcast and the thread is frozen until the next message.
 */
export function useAgentRunLive(
  runId: string | null,
  active: boolean,
): AgentRunLive | null {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<AgentRunLive | null>(null);
  // Timestamp of the last `stream` retained: two sendings sent 250 ms apart
  // may arrive out of order, and older text would delete the end
  // of the one already displayed.
  const lastAt = useRef(0);

  useEffect(() => {
    setLive(null);
    lastAt.current = 0;
    if (!runId || !active) return;

    return subscribeRun(runId, {
      onStream: (p) => {
        const at = typeof p.at === "number" ? p.at : 0;
        if (at < lastAt.current) return;
        lastAt.current = at;
        // What the charge changes in the state of the wire: apart, and pure
        // ([agent-live.ts](agent-live.ts)).
        setLive((prev) => liveFromStream(prev, p));
      },
      onEvent: (row) => {
        // A set event closes the writing phase of the round — except the files, which
        // have no other relay than the `files_changed` at the end of the turn (cf.
        // `liveAfterEvent`).
        setLive((prev) => liveAfterEvent(prev, row.type));
        // The cache is ONLY patched if it already exists: creating it here would cause
        // the query for fresh and would skip its initial loading.
        queryClient.setQueryData<{ events: AgentRunEvent[] }>(
          ["agent-run-events", runId],
          (old) => {
            if (!old) return old;
            if (old.events.some((e) => e.id === row.id)) return old;
            return { events: [...old.events, row].sort((a, b) => a.seq - b.seq) };
          },
        );
      },
    });
  }, [runId, active, queryClient]);

  return live;
}
