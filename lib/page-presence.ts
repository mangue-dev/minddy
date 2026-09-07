"use client";

// WHO IS ON WHICH PAGE (MIN-271) — presence, and nothing else.
//
// One channel per project, not one per page. The payload carries `pageId`, so a
// single subscription can show who is reading each wiki page. Moving to another
// page only updates the tracked state; it does not join another channel.
//
// Presence tells an editor before a write that someone else is on the page. The
// conflict response and block merge handle concurrent writes; the avatar helps
// avoid the conflict.
//
// This module is separate from the React hook so its complete channel lifecycle
// can be tested in lib/page-presence.test.ts. That test catches subscriptions
// that remain open after unmount, which static checks cannot detect.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { getSupabase } from "./supabase";
import { onRealtimeRekey, resolveRealtimeTopic } from "./realtime-topic";

/** Private topic authorized by `can_access_project`. */
export const pagePresenceTopic = (projectId: string) =>
  `page-presence:${projectId}`;

/** The minimum state needed to draw an avatar. */
export interface PagePresenceState {
  userId: string;
  pageId: string;
}

/** Viewed pages, keyed by page ID, containing other present user IDs. */
export type PagePresenceMap = Map<string, string[]>;

/** The minimum Supabase client surface needed by this lifecycle. */
type PresenceClient = Pick<
  SupabaseClient,
  "channel" | "removeChannel" | "rpc"
> & {
  realtime: { setAuth: () => Promise<unknown> };
};

export interface PagePresenceHandle {
  /** Track another page without leaving the project channel. */
  move: (pageId: string) => void;
  /** Leave the channel. Every caller must invoke this during cleanup. */
  close: () => void;
}

/**
 * Join project presence and track the current page.
 *
 * `onChange` receives other users after each presence change. It never contains
 * the current account, including its other tabs.
 *
 * Filtering and deduplication happen here so every caller receives the same
 * meaning: one avatar per other account. A second tab from the current account
 * must not make an otherwise empty page appear occupied.
 *
 * The token is pushed to the socket BEFORE the join, like everywhere else in
 * this repository: a private channel joined with the anon token is refused, silently.
 */
export function openPagePresence({
  projectId,
  userId,
  pageId,
  onChange,
  client,
}: {
  projectId: string;
  userId: string;
  pageId: string;
  onChange: (present: PagePresenceMap) => void;
  client?: PresenceClient;
}): PagePresenceHandle {
  const supabase = (client ?? getSupabase()) as PresenceClient;
  let channel: RealtimeChannel | null = null;
  let closed = false;
  let current = pageId;
  let connectVersion = 0;

  const publish = (ch: RealtimeChannel) => {
    const state = ch.presenceState<PagePresenceState>();
    const pages: PagePresenceMap = new Map();
    for (const entries of Object.values(state)) {
      for (const entry of entries) {
        if (!entry?.pageId || !entry.userId) continue;
        // Exclude every connection owned by the current account.
        if (entry.userId === userId) continue;
        const people = pages.get(entry.pageId);
        // Multiple tabs from one account produce one avatar.
        if (people) {
          if (!people.includes(entry.userId)) people.push(entry.userId);
        } else {
          pages.set(entry.pageId, [entry.userId]);
        }
      }
    }
    onChange(pages);
  };

  const connect = () => {
    const version = ++connectVersion;
    void (async () => {
      try {
        await supabase.realtime.setAuth();
        const topic = await resolveRealtimeTopic(
          supabase,
          pagePresenceTopic(projectId),
        );
        // Left while the token or topic was resolving: join nothing. This is
        // the case a quick unmount (open one page, open another) produces.
        if (closed || version !== connectVersion) return;
        // No `presence.key`: the default key is CONNECTION, so two tabs in the
        // same account are separate entries. Deduplication happens on reading.
        const ch = supabase.channel(topic, {
          config: { private: true },
        });
        ch.on("presence", { event: "sync" }, () => publish(ch));
        ch.subscribe((status) => {
          if (status !== "SUBSCRIBED" || closed || version !== connectVersion)
            return;
          void ch.track({ userId, pageId: current } satisfies PagePresenceState);
        });
        channel = ch;
      } catch {
        // The resolver denies a revoked member. Presence is advisory, so the
        // durable page APIs remain the fallback without retrying a dead scope.
      }
    })();
  };

  const reconnect = () => {
    if (closed) return;
    connectVersion += 1;
    if (channel) {
      const previous = channel;
      channel = null;
      void previous.untrack();
      void supabase.removeChannel(previous);
    }
    connect();
  };
  const stopRekey = onRealtimeRekey(reconnect);
  connect();

  return {
    move: (next: string) => {
      current = next;
      if (channel && !closed) {
        void channel.track({ userId, pageId: next } satisfies PagePresenceState);
      }
    },
    close: () => {
      if (closed) return;
      closed = true;
      connectVersion += 1;
      stopRekey();
      if (channel) {
        const ch = channel;
        channel = null;
        // Untrack first so other clients remove the avatar immediately instead
        // of waiting for the Presence session to expire.
        void ch.untrack();
        void supabase.removeChannel(ch);
      }
    },
  };
}
