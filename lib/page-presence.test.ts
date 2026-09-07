import { describe, expect, it, vi } from "vitest";

import {
  openPagePresence,
  pagePresenceTopic,
  type PagePresenceMap,
} from "./page-presence";
import { signalRealtimeRekey } from "./realtime-topic";

/**
 * MIN-271 — the complete lifecycle of the presence subscription.
 *
 * This catches a subscription that opens and never closes. Static checks cannot
 * prove cleanup, so the test opens and closes a channel and inspects each call.
 *
 * The fake Supabase client retains callbacks passed to `on` and `subscribe`, so
 * the test can replay a Presence sync without a socket.
 */

type PresenceEntry = { userId: string; pageId: string };

function fakeSupabase() {
  const calls = {
    channels: [] as string[],
    tracked: [] as PresenceEntry[],
    untracked: 0,
    removed: 0,
    resolved: [] as string[],
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
    rpc: async (_name: string, args: { p_topic: string }) => {
      calls.resolved.push(args.p_topic);
      return { data: `${args.p_topic}:v:7`, error: null };
    },
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
  it("joins the versioned project channel and tracks the open page", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    expect(supabase.calls.resolved).toEqual([pagePresenceTopic("proj")]);
    expect(supabase.calls.channels).toEqual([
      `${pagePresenceTopic("proj")}:v:7`,
    ]);
    expect(supabase.calls.tracked).toEqual([
      { userId: "moi", pageId: "page-1" },
    ]);
    handle.close();
  });

  it("leaves the channel during cleanup", async () => {
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

    // Untracking removes the avatar immediately; removing closes the channel.
    expect(supabase.calls.untracked).toBe(1);
    expect(supabase.calls.removed).toBe(1);

    // Cleanup remains idempotent when React mounts twice in development.
    handle.close();
    expect(supabase.calls.removed).toBe(1);
  });

  it("joins nothing when cleanup happens before authentication resolves", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "moi",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    // A quick navigation can unmount in the same tick as the opening.
    handle.close();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(supabase.calls.channels).toEqual([]);
    expect(supabase.calls.removed).toBe(0);
  });

  it("moves to another page without joining another channel", async () => {
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

  it("never counts the current account, including another tab", async () => {
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
      // A second current-account tab on another page is still excluded.
      b: [{ userId: "moi", pageId: "page-2" }],
      c: [{ userId: "elle", pageId: "page-2" }],
    });

    expect(seen.get("page-1")).toBeUndefined();
    expect(seen.get("page-2")).toEqual(["elle"]);
    handle.close();
  });

  it("groups presence by page with one avatar per account", async () => {
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

  it("re-resolves and rejoins after a membership rekey", async () => {
    const supabase = fakeSupabase();
    const handle = openPagePresence({
      projectId: "proj",
      userId: "me",
      pageId: "page-1",
      onChange: () => {},
      client: supabase.client,
    });
    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(1));

    signalRealtimeRekey();

    await vi.waitFor(() => expect(supabase.calls.channels).toHaveLength(2));
    expect(supabase.calls.resolved).toEqual([
      pagePresenceTopic("proj"),
      pagePresenceTopic("proj"),
    ]);
    expect(supabase.calls.untracked).toBe(1);
    expect(supabase.calls.removed).toBe(1);
    handle.close();
  });
});
