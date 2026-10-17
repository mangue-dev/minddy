"use client";

// WHERE COLLABORATORS ARE IN A PAGE (MIN-688) — editing carets and selections.
//
// One private Realtime channel per page, `page-collaboration:<pageId>`, bound
// by the database to the page's project membership generation: a member who is
// removed is rekeyed out, and a trashed page's channel stops resolving. The
// project-wide `page-presence` channel keeps answering "who is on which page";
// high-frequency coordinates stay off it, so a teammate on another page never
// receives them.
//
// Carets travel as BROADCAST, not Presence. Supabase allows a client only five
// Presence updates per 30 seconds and closes the channel beyond that, which a
// moving caret exceeds in a second; Presence is for slow-changing state.
// Broadcast keeps no state, so this module rebuilds what Presence gave:
// - a heartbeat while an editor has focus, and expiry of a caret not heard
//   from for a while (a crashed or closed tab disappears on its own);
// - an explicit departure on blur and on close;
// - a "hello" on joining, answered by every focused peer, so a newcomer sees
//   the carets already there instead of waiting for the next heartbeat;
// - a rejoin with backoff when the channel closes or errors.
//
// A caret is published in the coordinates of the last revision its author had
// confirmed, never including their pending steps (see `CollabStream`), so
// every receiver can map it onto its own screen — or hide it when it cannot.
//
// Trust: the user ID in a caret is the publisher's own claim, exactly as in
// `page-presence`. Only members of the page's project can send or receive on
// this channel, and receivers resolve names and colors from the member list,
// never from the payload.

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { getSupabase } from "./supabase";
import { resolveRealtimeTopic, watchRealtimeTopic } from "./realtime-topic";
import type { CollabField } from "./page-collaboration";

export const pageCollaborationTopic = (pageId: string) => `page-collaboration:${pageId}`;

/** Minimum interval between two caret publications of one session. */
export const CARET_PUBLISH_MS = 250;

/** A focused session re-announces its caret this often, even when still. */
export const CARET_HEARTBEAT_MS = 4_000;

/** A caret not heard from for this long is dropped (a closed or crashed tab). */
export const CARET_EXPIRY_MS = 10_000;

const CARET_EVENT = "caret";
const HELLO_EVENT = "hello";

export interface PeerCaret {
  userId: string;
  sessionId: string;
  field: CollabField;
  /** Confirmed stream revision the positions refer to. */
  revision: number;
  anchor: number;
  head: number;
  /** Publication counter: a delayed, older position never wins. */
  seq: number;
}

export type CaretPosition = Pick<PeerCaret, "field" | "revision" | "anchor" | "head">;

/** What travels: a caret, or its withdrawal (`caret: null`). */
interface CaretMessage {
  userId: string;
  sessionId: string;
  seq: number;
  caret: CaretPosition | null;
}

let lastCaretSeq = 0;

/**
 * A publication number that only grows for this tab, whatever channel handle
 * publishes it. A session keeps its ID across handles (a remount, React's
 * double effects in development, a rejoin), and receivers drop a caret whose
 * number is below the last one they saw for that ID: a counter that restarted
 * with each handle would make them ignore every newer caret.
 */
export function nextCaretSeq(): number {
  lastCaretSeq = Math.max(lastCaretSeq + 1, Date.now() * 1_000);
  return lastCaretSeq;
}

type CaretClient = Pick<SupabaseClient, "channel" | "removeChannel" | "rpc"> & {
  realtime: { setAuth: () => Promise<unknown> };
};

export interface PageCollaborationPresence {
  /** Publish this session's caret, or `null` when its editor lost focus. */
  publish: (caret: CaretPosition | null) => void;
  close: () => void;
}

function readMessage(value: unknown): CaretMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (typeof message.userId !== "string" || typeof message.sessionId !== "string" ||
      typeof message.seq !== "number" || !Number.isSafeInteger(message.seq)) return null;
  if (message.caret === null) return message as unknown as CaretMessage;
  const caret = message.caret as Record<string, unknown> | undefined;
  if (!caret || (caret.field !== "body" && caret.field !== "title")) return null;
  if (![caret.revision, caret.anchor, caret.head].every(
    (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return null;
  return message as unknown as CaretMessage;
}

/**
 * Peer sessions one channel tracks. A member could otherwise fill this tab's
 * memory with invented session IDs; real pages have a handful of editors.
 */
export const MAX_CARET_PEERS = 32;

export function openPageCollaborationPresence({
  pageId,
  userId,
  sessionId,
  onPeers,
  isMember,
  client,
}: {
  pageId: string;
  userId: string;
  sessionId: string;
  /**
   * Whether an account belongs to the page's project. A caret's user ID is the
   * publisher's claim; one naming no member is dropped instead of drawn.
   */
  isMember?: (userId: string) => boolean;
  /** Every other session's latest caret (other tabs of this account included). */
  onPeers: (peers: PeerCaret[]) => void;
  client?: CaretClient;
}): PageCollaborationPresence {
  const supabase = (client ?? getSupabase()) as CaretClient;
  let channel: RealtimeChannel | null = null;
  let joined = false;
  let closed = false;
  let connectVersion = 0;
  let resolved: string | null = null;
  let latest: CaretPosition | null = null;
  let sentAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  const peers = new Map<string, { caret: PeerCaret; heardAt: number }>();
  const lastSeq = new Map<string, number>();

  const emit = () => onPeers([...peers.values()].map((entry) => entry.caret));

  const receive = (value: unknown) => {
    const message = readMessage(value);
    if (!message || message.sessionId === sessionId) return;
    if (isMember && !isMember(message.userId)) return;
    if (message.caret && !peers.has(message.sessionId) && peers.size >= MAX_CARET_PEERS) return;
    // A delayed, older publication never replaces a newer one.
    if (message.seq < (lastSeq.get(message.sessionId) ?? -1)) return;
    lastSeq.set(message.sessionId, message.seq);
    if (message.caret) {
      peers.set(message.sessionId, {
        caret: { userId: message.userId, sessionId: message.sessionId, seq: message.seq, ...message.caret },
        heardAt: Date.now(),
      });
    } else {
      peers.delete(message.sessionId);
    }
    emit();
  };

  const send = (caret: CaretPosition | null) => {
    if (!channel || !joined || closed) return;
    sentAt = Date.now();
    void channel.send({
      type: "broadcast",
      event: CARET_EVENT,
      payload: { userId, sessionId, seq: nextCaretSeq(), caret } satisfies CaretMessage,
    });
  };

  const flush = () => {
    timer = null;
    send(latest);
  };

  const schedule = () => {
    if (closed || timer) return;
    timer = setTimeout(flush, Math.max(0, CARET_PUBLISH_MS - (Date.now() - sentAt)));
  };

  // The heartbeat keeps a still, focused caret alive on other screens; the
  // sweep drops carets whose publisher went silent.
  const heartbeat = setInterval(() => {
    if (latest && Date.now() - sentAt >= CARET_HEARTBEAT_MS) schedule();
    let dropped = false;
    for (const [id, entry] of peers) {
      if (Date.now() - entry.heardAt > CARET_EXPIRY_MS) {
        peers.delete(id);
        dropped = true;
      }
    }
    if (dropped) emit();
  }, 1_000);

  const connect = () => {
    const version = ++connectVersion;
    void (async () => {
      try {
        await supabase.realtime.setAuth();
        const topic = await resolveRealtimeTopic(supabase, pageCollaborationTopic(pageId));
        if (closed || version !== connectVersion) return;
        const ch = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } });
        ch.on("broadcast", { event: CARET_EVENT }, ({ payload }) => receive(payload));
        // A newcomer asks; every focused peer answers with its caret.
        ch.on("broadcast", { event: HELLO_EVENT }, () => {
          if (latest) schedule();
        });
        ch.subscribe((status) => {
          if (closed || version !== connectVersion) return;
          if (status === "SUBSCRIBED") {
            joined = true;
            failures = 0;
            void ch.send({ type: "broadcast", event: HELLO_EVENT, payload: { sessionId } });
            if (latest) schedule();
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            joined = false;
            if (retry) return;
            failures += 1;
            retry = setTimeout(() => {
              retry = null;
              reconnect();
            }, Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5)));
          }
        });
        channel = ch;
        resolved = topic;
      } catch {
        // Denied (revoked member, trashed page): carets are advisory, and the
        // document session reports the authoritative refusal.
      }
    })();
  };

  const disconnect = () => {
    joined = false;
    if (!channel) return;
    const previous = channel;
    channel = null;
    void supabase.removeChannel(previous);
  };

  function reconnect() {
    if (closed) return;
    connectVersion += 1;
    disconnect();
    peers.clear();
    emit();
    connect();
  }

  const stopWatching = watchRealtimeTopic(supabase, pageCollaborationTopic(pageId),
    () => ({ resolved, channel, version: connectVersion }), reconnect);
  connect();

  return {
    publish: (caret) => {
      const withdrawn = latest !== null && caret === null;
      latest = caret;
      if (closed) return;
      if (withdrawn) {
        // A departure goes out at once: a lingering caret misleads more than
        // a late one.
        if (timer) clearTimeout(timer);
        timer = null;
        send(null);
        return;
      }
      if (caret) schedule();
    },
    close: () => {
      if (closed) return;
      if (latest) send(null);
      closed = true;
      connectVersion += 1;
      if (timer) clearTimeout(timer);
      if (retry) clearTimeout(retry);
      clearInterval(heartbeat);
      stopWatching();
      disconnect();
    },
  };
}
