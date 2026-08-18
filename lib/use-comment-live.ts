"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

/**
 * A response @Numo LIVE, on the private topic `numo-comment:{commentId}`
 * (migration 20260909090000_numo_comment_live_stream).
 *
 * The assistant streams because its panel holds the SSE connection of the route
 * which runs the loop. A comment response cannot: it
 * is written in an after(), without a browser on the line. The server broadcasts
 * therefore the text of the round on the comment topic (lib/server/assistant/
 * comment-live.ts), and this is where we receive it — ~4 times per second, without a single
 * write to the base nor a single refetch of the thread.
 *
 * The refetch as long as the response is 'working' remains in place: it is the net
 * (message lost, tab asleep, subscription not yet attached).
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
}

/**
 * ONE channel per comment, regardless of the number of threads mounted on it: the
 * same ticket can be opened in side panel and in modal, and the same
 * socket cannot join the same topic twice.
 */
const channels = new Map<string, Entry>();

function subscribeComment(commentId: string, listener: Listener): () => void {
  let entry = channels.get(commentId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), closed: false };
    entry = fresh;
    channels.set(commentId, fresh);
    const supabase = getSupabase();
    // Same precaution as the RealtimeProvider: push the token BEFORE the join,
    // otherwise the private channel refuses the subscription (anon token).
    void supabase.realtime.setAuth().then(() => {
      if (fresh.closed) return;
      const channel = supabase.channel(`numo-comment:${commentId}`, {
        config: { private: true },
      });
      channel.on("broadcast", { event: "stream" }, ({ payload }) => {
        for (const l of fresh.listeners) l((payload ?? {}) as StreamPayload);
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
    channels.delete(commentId);
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
  active: boolean
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

    return subscribeComment(commentId, (p) => {
      const at = typeof p.at === "number" ? p.at : 0;
      if (at < lastAt.current) return;
      lastAt.current = at;
      const text = typeof p.text === "string" ? p.text : "";
      const tool = typeof p.tool === "string" ? p.tool : null;
      // Empty broadcast: nothing left to show live (failure), we give up
      // to the base line.
      setLive(text || tool ? { text, tool } : null);
    });
  }, [commentId, active]);

  return live;
}
