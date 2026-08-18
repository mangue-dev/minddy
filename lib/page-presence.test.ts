import { describe, expect, it, vi } from "vitest";

import {
  openPagePresence,
  pagePresenceTopic,
  type PagePresenceMap,
} from "./page-presence";

/**
 * MIN-271 — the LIFE CYCLE of the presence subscription.
 *
 * What this file catches, and which neither `tsc` nor a replay catches: a
 * subscription that goes up and never comes down. We already shipped it once (the
 * feature of PR 48) — the code compiled, it read well, and the
 * channel remained open forever. The only possible proof is to mount, de
 * dismount, and look at what was called.
 *
 * The setting is a fake Supabase client which KEEP the callbacks passed to
 * `on` and to `subscribe`: it's the only one way to replay a presence `sync` * without a socket, like `compact-path.test.ts` replays an SSE flow without a provider.
 */

type PresenceEntry = { userId: string; pageId: string };

function fakeSupabase() {
  const calls = {
    channels: [] as string[],
    tracked: [] as PresenceEntry[],
    untracked: 0,
    removed: 0,
  };
  let syncHandler: (() => void) | null = null;
  let state: Record<string, PresenceEntry[]> = {};

  const channel = {
    on(_type: string, _filter: unknown, handler: () => void) {
      syncHandler = handler;
      return channel;
    },
    subscribe(cb?: (status: string) => void) {
      cb?.("SUBSCRIBED");
      return channel;
    },
    presenceState: () => state,
    track: async (payload: PresenceEntry) => {
      calls.tracked.push(payload);
      return "ok";
    },
    untrack: async () => {
      calls.untracked += 1;
      return "ok";
    },
  };

  const client = {
    realtime: { setAuth: async () => undefined },
    channel: (topic: string) => {
      calls.channels.push(topic);
      return channel as never;
    },
    removeChannel: async () => {
      calls.removed += 1;
      return "ok" as never;
    },
  };

  return {
    client: client as never,
    calls,
    /** Replays a presence `sync` with the given state. */
    emit(next: Record<string, PresenceEntry[]>) {
      state = next;
      syncHandler?.();
    },
  };
}

describe("openPagePresence", () => {
  it("rejoint le canal du PROJET et s'y déclare sur la page ouverte", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    // One channel, that of the project — not one per page.
    expect(supabase.calls.channels).toEqual([pagePresenceTopic("proj")]);
    expect(supabase.calls.tracked).toEqual([
      { userId: "moi", pageId: "page-1" },
    ]);
    handle.close();
  });

  it("redescend du canal au démontage", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    handle.close();

    // Both: `untrack` removes the avatar from others immediately,
    // `removeChannel` ferme l'abonnement.
    expect(supabase.calls.untracked).toBe(1);
    expect(supabase.calls.removed).toBe(1);

    // And close twice (React mounts/unmounts twice in development) doesn't
    // ferme pas deux fois.
    handle.close();
    expect(supabase.calls.removed).toBe(1);
  });

  it("ne rejoint RIEN quand on part avant que le token soit poussé", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    // The disassembly happens in the same tick as the opening: that's what it does
    // a quick click from one page to another, and this is the path by which a
    // ghost channel survives its component.
    handle.close();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supabase.calls.channels).toEqual([]);
    expect(supabase.calls.removed).toBe(0);
  });

  it("change de page sans rejoindre un second canal", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.tracked).toHaveLength(1));

    handle.move("page-2");

    expect(supabase.calls.channels).toHaveLength(1);
    expect(supabase.calls.tracked.at(-1)).toEqual({
      userId: "moi",
      pageId: "page-2",
    });
    handle.close();
  });

  it("ne se compte JAMAIS soi-même, même depuis un autre onglet", async () => {
    const supabase = fakeSupabase();
    let seen: PagePresenceMap = new Map();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: (present) => {
        seen = present;
      },
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    supabase.emit({
      a: [{ userId: "moi", pageId: "page-1" }],
      // My second tab, on ANOTHER page: the tree pellet is there
      // lit up in front of a page that no one else was reading.
      b: [{ userId: "moi", pageId: "page-2" }],
      c: [{ userId: "elle", pageId: "page-2" }],
    });

    expect(seen.get("page-1")).toBeUndefined();
    expect(seen.get("page-2")).toEqual(["elle"]);
    handle.close();
  });

  it("range les présents par page, un avatar par compte", async () => {
    const supabase = fakeSupabase();
    let seen: PagePresenceMap = new Map();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: (present) => {
        seen = present;
      },
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    supabase.emit({
      // Two tabs from the same account on the same page: a single avatar.
      a: [{ userId: "elle", pageId: "page-1" }],
      b: [{ userId: "elle", pageId: "page-1" }],
      c: [{ userId: "moi", pageId: "page-1" }],
      d: [{ userId: "lui", pageId: "page-2" }],
    });

    expect(seen.get("page-1")).toEqual(["elle"]);
    expect(seen.get("page-2")).toEqual(["lui"]);
    handle.close();
  });
});
