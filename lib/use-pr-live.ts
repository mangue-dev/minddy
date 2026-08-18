"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { parsePrLiveParts, prLiveQueryKeys, pullRequestTopic } from "./pr-live";

/**
 * The live view of ONE pull request, from the point of view of the screen viewing it.
 *
 * The PR panel loads four independent caches (`["pull-request", id]`,
 * `["pr-comments", id]`, `["pr-commits", id]`, `["pr-review-comments", …]`),
 * all served by the on-demand forge. None polluted: the thread of a PR only
 * moved when returning from a local gesture or at the end of a Numo run. A
 * comment posted on github.com, an approval, a push commit, a thread
 * resolved: nothing was hitting the open panel before a reload.
 *
 * Topic `pull-request:{id}` has messages `changed` which NAME them
 * affected parts; we invalidate the corresponding caches and React Query will
 * reread. Nothing more: the content is read with the reader's token (MIN-144),
 * pushing what someone else has read would be wrong.
 *
 * Dedicated topic rather than the existing `project:{id}`, for the same reason
 * as `agent-run:{id}`: only tabs that VIEW this PR subscribe to it,
 * instead of hosing everyone in the project for a thread that no one else
 * has opened. The LIST goes through the project topic (the trigger for the
 * migration) — these are two different needs.
 */

/**
 * Coalescing by key. A GitHub review comes in a BURST — a
 * `pull_request_review` then N `pull_request_review_comment` — and each message
 * would require its own forge round trip. Window wider than that of
 * provider (200 ms): here a refetch costs a remote API call, not a
 * PostgREST.
 request */
const INVALIDATE_COALESCE_MS = 500;

interface Listener {
  onChanged: (parts: ReturnType<typeof parsePrLiveParts>) => void;
}

interface Entry {
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  closed: boolean;
}

/** ONE channel per PR, regardless of the number of views mounted on it. */
const channels = new Map<string, Entry>();

function subscribePr(prId: string, listener: Listener): () => void {
  let entry = channels.get(prId);
  if (!entry) {
    const fresh: Entry = { channel: null, listeners: new Set(), closed: false };
    entry = fresh;
    channels.set(prId, fresh);
    const supabase = getSupabase();
    // The token BEFORE the join, otherwise the private channel refuses the subscription.
    void supabase.realtime.setAuth().then(() => {
      if (fresh.closed) return;
      const channel = supabase.channel(pullRequestTopic(prId), {
        config: { private: true },
      });
      channel.on("broadcast", { event: "changed" }, ({ payload }) => {
        const parts = parsePrLiveParts((payload as { parts?: unknown } | null)?.parts);
        if (parts.length === 0) return;
        for (const l of fresh.listeners) l.onChanged(parts);
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
    channels.delete(prId);
    if (opened.channel) void getSupabase().removeChannel(opened.channel);
  };
}

export function usePrLive(prId: string | null, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!prId || !enabled) return;

    // Coalescing in TRAILS, like the provider's bridge: the first message
    // program the invalidation, those in the window go up in it.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const invalidate = (key: QueryKey) => {
      const hash = JSON.stringify(key);
      if (timers.has(hash)) return;
      timers.set(
        hash,
        setTimeout(() => {
          timers.delete(hash);
          void queryClient.invalidateQueries({ queryKey: key });
        }, INVALIDATE_COALESCE_MS),
      );
    };

    const stop = subscribePr(prId, {
      onChanged: (parts) => {
        for (const key of prLiveQueryKeys(prId, parts)) invalidate(key);
      },
    });

    return () => {
      stop();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, [prId, enabled, queryClient]);
}
