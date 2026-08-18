"use client";

// WHO IS ON WHICH PAGE (MIN-271) — presence, and nothing else.
//
// One channel per PROJECT, not one per page. The payload carries `pageId`, so a
// a single subscription is enough to know who reads what throughout the wiki: the tree can
// place your pad on any line without opening twenty channels, and
// changer de page ne rejoint rien — on se contente de retrack.
//
// What presence brings, and which versioned backup cannot
// give: know BEFORE writing that you are not alone. The 409 and the merger by
// block catches the collision; the avatar at the top of the page avoids it.
//
// The file is separated from the React hook, and not for the sake of division: that's what
// which makes the LIFE CYCLE testable (lib/page-presence.test.ts). A subscription
// which never comes down from its channel is the fault that we have already delivered a
// times (PR 48) — he compiled, he passed the type-check, and no one could
// catch it other than by going up and then taking it down for real.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { getSupabase } from "./supabase";

/** The topic. Private, authorized by `can_access_project` — cf. migration
 20261127090000_page_presence. */
export const pagePresenceTopic = (projectId: string) =>
  `page-presence:${projectId}`;

/** What we broadcast about ourselves: what is strictly necessary to draw an avatar. */
export interface PagePresenceState {
  userId: string;
  pageId: string;
}

/** The pages viewed, by pageId → the ids of OTHER people present. */
export type PagePresenceMap = Map<string, string[]>;

/** The minimum we ask of the Supabase client — enough to lie in a test
 without rebuilding half of the SDK. */
type PresenceClient = Pick<SupabaseClient, "channel" | "removeChannel"> & {
  realtime: { setAuth: () => Promise<unknown> };
};

export interface PagePresenceHandle {
  /** Declare yourself on another page, without leaving the channel. */
  move: (pageId: string) => void;
  /** To leave. To be called FOR DISASSEMBLY, without exception. */
  close: () => void;
}

/**
 * Joins the presence of the project and declares himself there.
 *
 * `onChange` receives the OTHERS with each movement, never yourself — not even from
 * another tab.
 *
 * Sorting is done here instead that in each caller, and this is the very meaning of
 * the indicator which imposes it: he answers "I am not alone", and a response
 * which counts the reader is false whatever it displays. A second tab at
 * self lit a tablet in the tree in front of a page that no one else
 * read — the presence said something, and that something was wrong.
 * Filtering in the caller asked everyone to remember who they are;
 * the one in the tree did not know not even.
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

  const publish = (ch: RealtimeChannel) => {
    const state = ch.presenceState<PagePresenceState>();
    const pages: PagePresenceMap = new Map();
    for (const entries of Object.values(state)) {
      for (const entry of entries) {
        if (!entry?.pageId || !entry.userId) continue;
        // Self, under all its connections: the presence says who ELSE reads.
        if (entry.userId === userId) continue;
        const people = pages.get(entry.pageId);
        // The same account opened twice on the same page is just an avatar.
        if (people) {
          if (!people.includes(entry.userId)) people.push(entry.userId);
        } else {
          pages.set(entry.pageId, [entry.userId]);
        }
      }
    }
    onChange(pages);
  };

  void supabase.realtime.setAuth().then(() => {
    // Left while the token was rising: join nothing. This is the case
    // a quick disassembly (open one page, open another)
    // produced every time.
    if (closed) return;
    // No `presence.key`: the default key is CONNECTION, so
    // two tabs in the same account are two separate entries. A built key
    // on the user would make them overlap, and closing one would remove
    // the avatar of the other. Deduplication is done on reading (`publish`),
    // where it costs nothing.
    const ch = supabase.channel(pagePresenceTopic(projectId), {
      config: { private: true },
    });
    ch.on("presence", { event: "sync" }, () => publish(ch));
    ch.subscribe((status) => {
      if (status !== "SUBSCRIBED" || closed) return;
      void ch.track({ userId, pageId: current } satisfies PagePresenceState);
    });
    channel = ch;
  });

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
      if (channel) {
        const ch = channel;
        channel = null;
        // `untrack` first: `removeChannel` closes the socket on the client side, but
        // it is the explicit `leave` which removes the avatar from OTHERS all
        // immediately rather than at the end of the in-person session.
        void ch.untrack();
        void supabase.removeChannel(ch);
      }
    },
  };
}
