import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CARET_EXPIRY_MS,
  MAX_CARET_PEERS,
  nextCaretSeq,
  openPageCollaborationPresence,
  pageCollaborationTopic,
  type PeerCaret,
} from "./page-collaboration-presence";

/**
 * A fake private Broadcast channel shared by every handle: a `send` reaches
 * every other subscriber of the topic (`self: false`), like Supabase does for
 * the members of a private channel. `fail()` closes every channel, as the
 * server does on an error.
 */
function sharedBroadcast() {
  type Handler = (message: { payload: unknown }) => void;
  const subscribers = new Set<{ handlers: Map<string, Handler>; status?: (status: string) => void }>();
  const sent: Array<{ event: string; payload: unknown }> = [];
  const order: Array<{ handlers: Map<string, Handler>; muted: boolean }> = [];
  const client = {
    realtime: { setAuth: async () => undefined },
    rpc: async (_name: string, args: { p_topic: string }) => ({ data: `${args.p_topic}:v:1`, error: null }),
    channel: () => {
      const entry = { handlers: new Map<string, Handler>(), status: undefined as ((status: string) => void) | undefined, muted: false };
      order.push(entry);
      const channel = {
        on(_type: string, filter: { event: string }, handler: Handler) {
          entry.handlers.set(filter.event, handler);
          return channel;
        },
        subscribe(cb?: (status: string) => void) {
          entry.status = cb;
          subscribers.add(entry);
          cb?.("SUBSCRIBED");
          return channel;
        },
        send: async (message: { event: string; payload: unknown }) => {
          if (entry.muted) return "ok";
          sent.push(message);
          for (const other of subscribers) {
            if (other !== entry) other.handlers.get(message.event)?.({ payload: message.payload });
          }
          return "ok";
        },
        remove() {
          subscribers.delete(entry);
        },
      };
      return channel as never;
    },
    removeChannel: async (channel: { remove(): void }) => {
      channel.remove();
      return "ok" as never;
    },
  };
  return {
    client: client as never,
    sent,
    /** The n-th opened channel goes silent, as a crashed tab's would. */
    crash(index: number) {
      order[index].muted = true;
    },
    fail() {
      for (const entry of subscribers) {
        subscribers.delete(entry);
        entry.status?.("CLOSED");
      }
    },
  };
}

const caret = { field: "body" as const, revision: 3, anchor: 5, head: 5 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function open(client: never, userId: string, sessionId: string, seen?: PeerCaret[][]) {
  return openPageCollaborationPresence({
    pageId: "page-1", userId, sessionId, client, onPeers: (peers) => seen?.push(peers),
  });
}

describe("page collaboration carets (MIN-688)", () => {
  it("uses a private per-page topic", () => {
    expect(pageCollaborationTopic("page-1")).toBe("page-collaboration:page-1");
  });

  it("throttles a moving caret far below any Realtime client limit", async () => {
    const realtime = sharedBroadcast();
    const bob = open(realtime.client, "bob", "bob-session");
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 100; i += 1) {
      bob.publish({ ...caret, head: i });
      await vi.advanceTimersByTimeAsync(20);
    }
    const carets = realtime.sent.filter((message) => message.event === "caret");
    // Two seconds of a caret moving every 20 ms: at most one message per 250 ms.
    expect(carets.length).toBeLessThanOrEqual(9);
    bob.close();
  });

  it("shows a newcomer the carets already there, and withdraws one on blur", async () => {
    const realtime = sharedBroadcast();
    const bob = open(realtime.client, "bob", "bob-session");
    await vi.advanceTimersByTimeAsync(10);
    bob.publish(caret);
    await vi.advanceTimersByTimeAsync(300);

    const seen: PeerCaret[][] = [];
    const alice = open(realtime.client, "alice", "alice-session", seen);
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.at(-1)?.map((peer) => peer.userId)).toEqual(["bob"]);

    bob.publish(null);
    await vi.advanceTimersByTimeAsync(10);
    expect(seen.at(-1)).toEqual([]);
    alice.close();
    bob.close();
  });

  it("draws no caret claiming an account outside the project", async () => {
    const realtime = sharedBroadcast();
    const seen: PeerCaret[][] = [];
    const alice = openPageCollaborationPresence({
      pageId: "page-1", userId: "alice", sessionId: "alice-session", client: realtime.client,
      isMember: (id) => id === "alice" || id === "bob", onPeers: (peers) => seen.push(peers),
    });
    const bob = open(realtime.client, "bob", "bob-session");
    const mallory = open(realtime.client, "mallory", "mallory-session");
    await vi.advanceTimersByTimeAsync(10);
    bob.publish(caret);
    mallory.publish(caret);
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.at(-1)?.map((peer) => peer.userId)).toEqual(["bob"]);
    alice.close();
    bob.close();
    mallory.close();
  });

  it("tracks a bounded number of peer sessions per channel", async () => {
    const realtime = sharedBroadcast();
    const seen: PeerCaret[][] = [];
    const alice = open(realtime.client, "alice", "alice-session", seen);
    await vi.advanceTimersByTimeAsync(10);
    const others = Array.from({ length: MAX_CARET_PEERS + 8 }, (_, i) => open(realtime.client, "bob", `bob-${i}`));
    await vi.advanceTimersByTimeAsync(10);
    for (const other of others) other.publish(caret);
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.at(-1)).toHaveLength(MAX_CARET_PEERS);
    alice.close();
    for (const other of others) other.close();
  });

  it("keeps a still caret alive with heartbeats and expires a silent one", async () => {
    const realtime = sharedBroadcast();
    const seen: PeerCaret[][] = [];
    const alice = open(realtime.client, "alice", "alice-session", seen);
    const bob = open(realtime.client, "bob", "bob-session");
    await vi.advanceTimersByTimeAsync(10);
    bob.publish(caret);
    await vi.advanceTimersByTimeAsync(CARET_EXPIRY_MS * 2);
    expect(seen.at(-1)?.map((peer) => peer.userId)).toEqual(["bob"]);

    // A crashed tab: its channel goes silent without saying goodbye.
    realtime.crash(1);
    await vi.advanceTimersByTimeAsync(CARET_EXPIRY_MS + 2_000);
    expect(seen.at(-1)).toEqual([]);
    alice.close();
    bob.close();
  });

  it("accepts a session's carets after its handle is recreated", async () => {
    const realtime = sharedBroadcast();
    const seen: PeerCaret[][] = [];
    const alice = open(realtime.client, "alice", "alice-session", seen);
    const first = open(realtime.client, "bob", "bob-session");
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 5; i += 1) {
      first.publish({ ...caret, head: i });
      await vi.advanceTimersByTimeAsync(300);
    }
    first.close();
    const second = open(realtime.client, "bob", "bob-session");
    await vi.advanceTimersByTimeAsync(10);
    second.publish({ ...caret, head: 42 });
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.at(-1)?.map((peer) => peer.head)).toEqual([42]);
    second.close();
    alice.close();
  });

  it("rejoins after the channel closes", async () => {
    const realtime = sharedBroadcast();
    const seen: PeerCaret[][] = [];
    const alice = open(realtime.client, "alice", "alice-session", seen);
    const bob = open(realtime.client, "bob", "bob-session");
    await vi.advanceTimersByTimeAsync(10);
    realtime.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    bob.publish(caret);
    await vi.advanceTimersByTimeAsync(300);
    expect(seen.at(-1)?.map((peer) => peer.userId)).toEqual(["bob"]);
    alice.close();
    bob.close();
  });

  it("numbers publications in increasing order even within one millisecond", () => {
    const numbers = Array.from({ length: 5 }, () => nextCaretSeq());
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    expect(new Set(numbers).size).toBe(5);
  });
});
