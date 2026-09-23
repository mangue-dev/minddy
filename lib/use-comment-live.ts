"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import {
  numoCommentTopic,
  type CommentLiveTable,
} from "./comment-live-topic";
import { onRealtimeRekey, resolveRealtimeTopic } from "./realtime-topic";

/**
 * Compatibility receiver for comment streams from servers draining during rollout.
 * Current servers persist encrypted snapshots through the comment repository;
 * metadata invalidation and polling fetch their plaintext through authorized APIs.
 */

export interface CommentLive {
  /** Answer as written so far. */
  text: string;
  /** Current tool — it takes precedence over the text on the screen. */
  tool: string | null;
}

interface StreamPayload {
  text?: unknown;
  tool?: unknown;
  at?: unknown;
}

type Listener = (payload: StreamPayload) => void;

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  /** Last subscriber left during opening → do not contact afterwards. */
  closed: boolean;
  connectVersion: number;
  stopRekey: () => void;
}

/**
 * ONE channel per comment, regardless of the number of threads mounted on it: the
 * same ticket can be opened in side panel and in modal, and the same
 * socket cannot join the same topic twice.
 */
const channels = new Map<string, Entry>();

function subscribeComment(
  commentId: string,
  table: CommentLiveTable,
  listener: Listener,
): () => void {
  const logicalTopic = numoCommentTopic(commentId, table);
  let entry = channels.get(logicalTopic);
  if (!entry) {
    const fresh: Entry = {
      channel: null,
      listeners: new Set(),
      closed: false,
      connectVersion: 0,
      stopRekey: () => {},
    };
    entry = fresh;
    channels.set(logicalTopic, fresh);
    const supabase = getSupabase();
    const connect = () => {
      const version = ++fresh.connectVersion;
      if (fresh.channel) {
        const previous = fresh.channel;
        fresh.channel = null;
        void supabase.removeChannel(previous);
      }
      void (async () => {
        try {
          await supabase.realtime.setAuth();
          const topic = await resolveRealtimeTopic(supabase, logicalTopic);
          if (fresh.closed || version !== fresh.connectVersion) return;
          const channel = supabase.channel(topic, {
            config: { private: true },
          });
          channel.on("broadcast", { event: "stream" }, ({ payload }) => {
            for (const l of fresh.listeners) l((payload ?? {}) as StreamPayload);
          });
          channel.subscribe();
          fresh.channel = channel;
        } catch {
          // The durable comment row and its polling loop remain the fallback.
        }
      })();
    };
    fresh.stopRekey = onRealtimeRekey(connect);
    connect();
  }
  entry.listeners.add(listener);

  const opened = entry;
  return () => {
    opened.listeners.delete(listener);
    if (opened.listeners.size > 0) return;
    opened.closed = true;
    opened.connectVersion += 1;
    opened.stopRekey();
    channels.delete(logicalTopic);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

/**
 * `active` = the response is being written (assistant_status 'working'). At
 * rest we do not subscribe: there is nothing to broadcast, and the finished comment is
 * that of the base.
 *
 * Returns `null` as long as nothing has happened — the caller then falls back to the
 * line in base, which is what an open tab sees along the way.
 */
export function useCommentLive(
  commentId: string | null,
  active: boolean,
  table: CommentLiveTable = "comments",
): CommentLive | null {
  const [live, setLive] = useState<CommentLive | null>(null);
  // Timestamp of the last message retained: two broadcasts left at 250 ms
  // discrepancies can arrive out of order, and older text would erase
  // the end of the one already displayed.
  const lastAt = useRef(0);

  useEffect(() => {
    setLive(null);
    lastAt.current = 0;
    if (!commentId || !active) return;

    return subscribeComment(commentId, table, (p) => {
      const at = typeof p.at === "number" ? p.at : 0;
      if (at < lastAt.current) return;
      lastAt.current = at;
      const text = typeof p.text === "string" ? p.text : "";
      const tool = typeof p.tool === "string" ? p.tool : null;
      // Empty broadcast: nothing left to show live (failure), we give up
      // to the base line.
      setLive(text || tool ? { text, tool } : null);
    });
  }, [commentId, active, table]);

  return live;
}
