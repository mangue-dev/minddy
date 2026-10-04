"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { AgentEventType } from "./agent-api";
import { liveAfterEvent, liveFromStream, type AgentRunLive, type StreamPayload } from "./agent-live";
import { parseAgentLocalDiff, type AgentLocalDiff } from "./agent-local-diff";
import { onRealtimeRekey, resolveRealtimeTopic } from "./realtime-topic";
import { useAppTabActive } from "./app-tab-route-context";
import { startVisiblePoll } from "./visible-poll";

export type { AgentRunLive } from "./agent-live";

/**
 * The thread of a LIVE code agent session (private topic
 * `agent-run:{runId}`, migration 20260908090000_agent_live_stream).
 *
 * Numo streams because its thread holds the SSE connection of the route which does
 * loop. The code agent cannot: its loop runs as a
 * task in the background, without a browser at the end. The server stores a
 * protected current snapshot for the live tail and diff. This hook polls the
 * authorized route with a 500 ms interval while the run and view are active.
 * Hidden documents suspend snapshot reads and catch up immediately on return.
 *
 * `event` — a source-row invalidation. The authorized event route loads the
 * content; Realtime never carries the event payload.
 *
 * The polling of `useAgentRunEventsQuery` remains in place: it's the net (message
 * lost, sleeping tab, subscription not yet attached).
 */

interface Listener {
  onStream?: (payload: StreamPayload) => void;
  onEvent?: (signal: { id: string; type: AgentEventType }) => void;
  onDiff?: (diff: AgentLocalDiff) => void;
}

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  /** Last subscriber left during opening → do not contact afterwards. */
  closed: boolean;
  connectVersion: number;
  stopRekey: () => void;
  stopPoll: () => void;
  stream: StreamPayload | null;
  diff: AgentLocalDiff | null;
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
    const fresh: Entry = {
      channel: null,
      listeners: new Set(),
      closed: false,
      connectVersion: 0,
      stopRekey: () => {},
      stopPoll: () => {},
      stream: null,
      diff: null,
    };
    entry = fresh;
    channels.set(runId, fresh);
    const supabase = getSupabase();
    const connect = () => {
      const version = ++fresh.connectVersion;
      if (fresh.channel) {
        const previous = fresh.channel;
        fresh.channel = null;
        void supabase.removeChannel(previous);
      }
      // Push the token and resolve the current membership generation before
      // joining. A removed member cannot resolve the replacement topic.
      void (async () => {
        try {
          await supabase.realtime.setAuth();
          const topic = await resolveRealtimeTopic(supabase, `agent-run:${runId}`);
          if (fresh.closed || version !== fresh.connectVersion) return;
          const channel = supabase.channel(topic, {
            config: { private: true },
          });
          channel.on("broadcast", { event: "event" }, ({ payload }) => {
            const signal = payload as { id?: string; type?: string } | null;
            if (!signal?.id || !signal.type) return;
            // A persisted event supersedes provisional text. Do not replay it
            // to a view that resumes before the next live snapshot arrives.
            fresh.stream = null;
            for (const l of fresh.listeners) l.onEvent?.({
              id: signal.id, type: signal.type as AgentEventType,
            });
          });
          channel.subscribe();
          fresh.channel = channel;
        } catch {
          // Polling remains the durable fallback when access was revoked or
          // Realtime topic resolution is temporarily unavailable.
        }
      })();
    };
    fresh.stopRekey = onRealtimeRekey(connect);
    connect();
    let streamAt = 0;
    let diffAt = 0;
    const poll = async (signal: AbortSignal) => {
      if (fresh.closed) return;
      try {
        const response = await fetch(`/api/agent-runs/${runId}/live`, {
          cache: "no-store",
          signal,
        });
        if (!response.ok || fresh.closed || signal.aborted) return;
        const value = await response.json() as {
          stream?: StreamPayload | null;
          diff?: Record<string, unknown> | null;
        };
        if (fresh.closed || signal.aborted) return;
        const nextStreamAt = typeof value.stream?.at === "number" ? value.stream.at : 0;
        if (nextStreamAt > streamAt) {
          streamAt = nextStreamAt;
          fresh.stream = value.stream ?? {};
          for (const l of fresh.listeners) l.onStream?.(fresh.stream);
        }
        const nextDiffAt = typeof value.diff?.at === "number" ? value.diff.at : 0;
        if (nextDiffAt > diffAt) {
          diffAt = nextDiffAt;
          const diff = parseAgentLocalDiff(value.diff);
          fresh.diff = diff;
          for (const l of fresh.listeners) l.onDiff?.(diff);
        }
      } catch {
        // The next poll retries after a transient network failure.
      }
    };
    fresh.stopPoll = startVisiblePoll(poll, 500);
  }
  entry.listeners.add(listener);
  // Another visible view may already own this poll. Its timestamp cursor must
  // not leave a newly resumed subscriber blank until the snapshot changes.
  if (entry.stream) listener.onStream?.(entry.stream);
  if (entry.diff) listener.onDiff?.(entry.diff);

  const opened = entry;
  return () => {
    opened.listeners.delete(listener);
    if (opened.listeners.size > 0) return;
    opened.closed = true;
    opened.connectVersion += 1;
    opened.stopRekey();
    opened.stopPoll();
    channels.delete(runId);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

/** Patch produced on the machine during the round. It shares one authorized
 * snapshot poll with the stream. When idle, the persistent event takes over. */
export function useAgentRunLocalDiff(
  runId: string | null,
  active: boolean,
): AgentLocalDiff | null {
  const viewActive = useAppTabActive();
  const [diff, setDiff] = useState<AgentLocalDiff | null>(null);

  useEffect(() => {
    setDiff(null);
    if (!runId || !active || !viewActive) return;
    return subscribeRun(runId, {
      onDiff: (next) => {
        // The relay already validates the shape; the order is carried by the wrapper
        //Realtime. Two successive readings are complete snapshots.
        setDiff(next);
      },
    });
  }, [runId, active, viewActive]);

  return diff;
}

/**
 * `active` = the agent is working. When idle, we do not subscribe: there is nothing to broadcast and the thread is frozen until the next message.
 */
export function useAgentRunLive(
  runId: string | null,
  active: boolean,
): AgentRunLive | null {
  const viewActive = useAppTabActive();
  const queryClient = useQueryClient();
  const [live, setLive] = useState<AgentRunLive | null>(null);
  // Timestamp of the last `stream` retained: two sendings sent 250 ms apart
  // may arrive out of order, and older text would delete the end
  // of the one already displayed.
  const lastAt = useRef(0);

  useEffect(() => {
    setLive(null);
    lastAt.current = 0;
    if (!runId || !active || !viewActive) return;

    return subscribeRun(runId, {
      onStream: (p) => {
        const at = typeof p.at === "number" ? p.at : 0;
        if (at < lastAt.current) return;
        lastAt.current = at;
        // What the charge changes in the state of the wire: apart, and pure
        // ([agent-live.ts](agent-live.ts)).
        setLive((prev) => liveFromStream(prev, p));
      },
      onEvent: (signal) => {
        // A set event closes the writing phase of the round — except the files, which
        // have no other relay than the `files_changed` at the end of the turn (cf.
        // `liveAfterEvent`).
        setLive((prev) => liveAfterEvent(prev, signal.type));
        void queryClient.invalidateQueries({ queryKey: ["agent-run-events", runId] });
      },
    });
  }, [runId, active, viewActive, queryClient]);

  return live;
}
