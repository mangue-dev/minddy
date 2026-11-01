"use client";

// The LIVE SESSION of an open issue or objective description, issue plan or
// routine instruction (MIN-728, MIN-832): one
// step stream, its wake-ups and the collaborators' carets — the page session
// (lib/use-page-collaboration.ts) without the title stream.
//
// The session is kept in a ref, not in effects: a surface that re-renders or
// hides keeps its stream, and a stream left with unconfirmed steps keeps
// sending them on its own after the editor goes (CollabStream.detach). Effects
// only own what stops with visibility: wake-ups, carets and the unload guard.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";

import type {
  BodyCollaboration,
  CaretView,
} from "@/components/pages/page-collaboration";
import type { CollabStream } from "./page-collaboration-stream";
import type { CollabRefusal } from "./page-collaboration";
import {
  descriptionCollaborationTopic,
  takeDescriptionSnapshot,
  type DescriptionKind,
  type DescriptionSnapshot,
} from "./description-collaboration";
import { onDocumentHead } from "./document-collaboration-signals";
import {
  openPageCollaborationPresence,
  type PageCollaborationPresence,
  type PeerCaret,
} from "./page-collaboration-presence";

type StreamModule = typeof import("./description-collaboration-stream");

let streamModuleLoad: Promise<StreamModule> | null = null;

/** Load the ProseMirror half of the session (see description-collaboration-stream.ts). */
export function loadDescriptionCollaborationStream(): Promise<StreamModule> {
  streamModuleLoad ??= import("./description-collaboration-stream").catch((error) => {
    // A failed chunk load is retried by the next session.
    streamModuleLoad = null;
    throw error;
  });
  return streamModuleLoad;
}

let idlePreloadScheduled = false;

/** Warm the stream module during idle time, once per tab, like the editor itself. */
function scheduleIdleStreamPreload(): void {
  if (idlePreloadScheduled || typeof window === "undefined") return;
  idlePreloadScheduled = true;
  const run = () => { void loadDescriptionCollaborationStream().catch(() => {}); };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3000 });
  else window.setTimeout(run, 1500);
}

export interface DescriptionCollaborationSession {
  /** `unavailable` falls back to saving the Markdown (an old server, a failed read). */
  status: "loading" | "ready" | "unavailable";
  /** The document the editor opens with, at the stream head. */
  doc: JSONContent | null;
  collaboration: BodyCollaboration | null;
  /** Sends everything pending; false while work remains unconfirmed. */
  flush: () => Promise<boolean>;
  hasUnsavedChanges: () => boolean;
}

interface Member {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
}

function sessionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Sessions kept between two openings of a description, most recent last. A
 * reopened description reuses its stream — no snapshot round trip, and the
 * stream catches up from where it was when its editor attaches. A stream
 * still sending when it leaves the set keeps sending on its own.
 */
const retained = new Map<string, Session>();
const MAX_RETAINED_SESSIONS = 16;

function retain(session: Session): void {
  retained.delete(session.key);
  retained.set(session.key, session);
  while (retained.size > MAX_RETAINED_SESSIONS) {
    const [oldestKey, oldest] = retained.entries().next().value as [string, Session];
    retained.delete(oldestKey);
    if (!oldest.stream.hasPending()) oldest.stream.close();
  }
}

/** A retained session no other surface is editing right now. */
function reusable(key: string): Session | null {
  const session = retained.get(key);
  return session && !session.stream.attached ? session : null;
}

interface Session {
  key: string;
  snapshot: DescriptionSnapshot;
  stream: CollabStream;
  /** The module the stream came from (its beacon size, caret colors). */
  engine: StreamModule;
  clientId: string;
  peers: PeerCaret[];
  hydrationRefused: boolean;
  caretListeners: Set<() => void>;
  attachedListeners: Set<(attached: boolean) => void>;
  /** Whoever holds the session now, told when its stream stops for good. */
  fatalListeners: Set<(error: unknown) => void>;
  presence: PageCollaborationPresence | null;
}

export function useDescriptionCollaboration({
  kind,
  id,
  userId,
  enabled,
  members,
  onRefused,
  onFatal,
}: {
  kind: DescriptionKind;
  id: string | null;
  userId: string | null;
  /** Off for a surface that only reads Markdown (a reader's preview). */
  enabled: boolean;
  members: Member[];
  onRefused: (reason: CollabRefusal) => void;
  onFatal: (error: unknown) => void;
}): DescriptionCollaborationSession {
  const key = id && enabled ? `${kind}:${id}` : null;
  const sessionRef = useRef<Session | null>(null);
  // The status is kept WITH the key it describes: re-enabled (a panel
  // reopened, the Plan tab shown again), the hook reads "loading" for the new
  // key instead of the "unavailable" its previous key left behind, which
  // mounted a fallback editor for a frame.
  const [state, setState] = useState<{ key: string | null; status: DescriptionCollaborationSession["status"] }>(() => {
    if (key && !sessionRef.current) sessionRef.current = reusable(key);
    return { key, status: key && sessionRef.current?.key === key ? "ready" : "loading" };
  });
  const status: DescriptionCollaborationSession["status"] = !key
    ? "unavailable"
    : state.key === key ? state.status : "loading";
  const setStatus = useCallback(
    (next: DescriptionCollaborationSession["status"], forKey: string | null) =>
      setState({ key: forKey, status: next }),
    []
  );
  const [, setRevision] = useState(0);
  const rerender = useCallback(() => setRevision((n) => n + 1), []);

  const onRefusedRef = useRef(onRefused);
  onRefusedRef.current = onRefused;
  const onFatalRef = useRef(onFatal);
  onFatalRef.current = onFatal;
  const membersRef = useRef(members);
  membersRef.current = members;
  const canWriteRef = useRef(false);

  // Hosts mount before their description opens: warm the stream module then.
  useEffect(scheduleIdleStreamPreload, []);

  /* ── Creating the session from a snapshot ──────────────────────────────── */
  useEffect(() => {
    if (!key || !id) {
      setStatus("unavailable", key);
      return;
    }
    if (sessionRef.current?.key === key) {
      retain(sessionRef.current);
      setStatus("ready", key);
      return;
    }
    const kept = reusable(key);
    if (kept) {
      sessionRef.current = kept;
      retain(kept);
      setStatus("ready", key);
      return;
    }
    // The previous description's stream is not closed: detached, it keeps
    // sending whatever was still unsaved.
    sessionRef.current = null;
    setStatus("loading", key);
    const controller = new AbortController();
    // The snapshot and the stream module load together: the module is on the
    // network path only when idle time has not warmed it yet.
    void Promise.all([takeDescriptionSnapshot(kind, id, controller.signal), loadDescriptionCollaborationStream()])
      .then(([snapshot, engine]) => {
        if (controller.signal.aborted) return;
        // A plan's document has its own id; a description's is its parent's.
        if (snapshot.kind !== kind || (kind !== "plan" && snapshot.documentId !== id)) {
          setStatus("unavailable", key);
          return;
        }
        canWriteRef.current = snapshot.canWrite;
        const clientId = sessionId();
        const attachedListeners = new Set<(attached: boolean) => void>();
        const stream = engine.createDescriptionStream({
          kind,
          id,
          snapshot,
          clientId,
          canSend: () => canWriteRef.current,
          onRefused: (reason, dropped) => {
            console.warn("[description-collaboration] batch refused:", reason);
            if (reason === "presentation-changed") {
              if (sessionRef.current?.key === key) sessionRef.current.hydrationRefused = true;
              if (dropped > 0) onRefusedRef.current("step-failed");
              return;
            }
            onRefusedRef.current(reason);
          },
          // A stopped stream sends nothing more: it leaves the retained set,
          // and the hook holding it — the creator, or one that adopted it
          // later — falls back to saving Markdown.
          onFatal: (error) => {
            if (retained.get(key) === created) retained.delete(key);
            // Before any surface subscribed, its creator still holds it.
            if (created.fatalListeners.size === 0 && sessionRef.current === created) {
              sessionRef.current = null;
              setStatus("unavailable", key);
              onFatalRef.current(error);
              return;
            }
            // A copy: a listener's surface may unsubscribe while being told.
            for (const listener of Array.from(created.fatalListeners)) listener(error);
          },
          onDiscarded: () => onRefusedRef.current("step-failed"),
          onAttached: (attached) => {
            for (const listener of attachedListeners) listener(attached);
          },
        });
        const created: Session = {
          key,
          snapshot,
          stream,
          engine,
          clientId,
          peers: [],
          hydrationRefused: false,
          caretListeners: new Set(),
          attachedListeners,
          fatalListeners: new Set(),
          presence: null,
        };
        sessionRef.current = created;
        retain(created);
        setStatus("ready", key);
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("unavailable", key);
      });
    return () => controller.abort();
  }, [key, kind, id]);

  /* ── What stops with visibility ────────────────────────────────────────── */
  const session = status === "ready" && key && sessionRef.current?.key === key ? sessionRef.current : null;
  useEffect(() => {
    if (!session) return;
    const onSessionFatal = (error: unknown) => {
      if (sessionRef.current === session) {
        sessionRef.current = null;
        setStatus("unavailable", session.key);
      }
      onFatalRef.current(error);
    };
    session.fatalListeners.add(onSessionFatal);
    return () => {
      session.fatalListeners.delete(onSessionFatal);
    };
  }, [session, setStatus]);
  useEffect(() => {
    if (!session || !id) return;
    const { stream } = session;
    // Head wake-ups name the document row, which is a plan's own.
    const stopHeads = onDocumentHead(kind, session.snapshot.documentId, (revision) => {
      if (revision !== null) stream.noteRemoteHead(revision);
      else void stream.pull();
    });
    // Recovery: a lost broadcast, a dead socket, a sleeping laptop.
    const catchUp = () => {
      if (document.visibilityState === "hidden") return;
      void stream.pull();
    };
    // Leaving the tab with unsent typing: deliver it with keepalive, and warn.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!stream.hasPending()) return;
      stream.beacon(session.engine.COLLAB_BEACON_MAX_BYTES);
      event.preventDefault();
    };
    window.addEventListener("online", catchUp);
    window.addEventListener("focus", catchUp);
    window.addEventListener("pageshow", catchUp);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", catchUp);
    catchUp();
    return () => {
      stopHeads();
      window.removeEventListener("online", catchUp);
      window.removeEventListener("focus", catchUp);
      window.removeEventListener("pageshow", catchUp);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", catchUp);
    };
  }, [session, kind, id]);

  // Carets, while the description is shown. A routine's instruction has a
  // single writer and no caret topic.
  useEffect(() => {
    if (!session || !id || !userId || kind === "routine") return;
    const presence = openPageCollaborationPresence({
      pageId: id,
      topic: descriptionCollaborationTopic(kind, id),
      userId,
      sessionId: session.clientId,
      isMember: (member) => membersRef.current.some((candidate) => candidate.user_id === member),
      onPeers: (peers) => {
        session.peers = peers;
        for (const listener of session.caretListeners) listener();
        rerender();
      },
    });
    session.presence = presence;
    return () => {
      presence.close();
      if (session.presence === presence) session.presence = null;
      session.peers = [];
      for (const listener of session.caretListeners) listener();
    };
  }, [session, kind, id, userId, rerender]);

  /* ── The editor binding ────────────────────────────────────────────────── */
  const nameOf = useCallback((member: string) => {
    const found = membersRef.current.find((candidate) => candidate.user_id === member);
    return found?.full_name?.trim() || found?.email?.split("@")[0] || "";
  }, []);

  const canWrite = session?.snapshot.canWrite ?? false;
  const collaboration = useMemo<BodyCollaboration | null>(() => {
    if (!session) return null;
    return {
      stream: session.stream,
      clientId: session.clientId,
      canSend: canWrite,
      carets: () => session.peers
        .filter((peer) => peer.field === "body")
        .map((peer): CaretView => ({
          sessionId: peer.sessionId,
          name: nameOf(peer.userId),
          color: session.engine.caretColor(peer.userId),
          revision: peer.revision,
          anchor: peer.anchor,
          head: peer.head,
        })),
      onCaretsChange: (listener) => {
        session.caretListeners.add(listener);
        return () => session.caretListeners.delete(listener);
      },
      canHydrate: () => !session.hydrationRefused,
      onAttachedChange: (listener) => {
        session.attachedListeners.add(listener);
        return () => session.attachedListeners.delete(listener);
      },
      publishCaret: (selection) => {
        if (!session.presence) return;
        // The session's own right: a hook that adopted a retained session
        // never read its snapshot.
        if (!selection || !session.snapshot.canWrite) {
          session.presence.publish(null);
          return;
        }
        const anchor = session.stream.toConfirmed(selection.anchor);
        const head = session.stream.toConfirmed(selection.head);
        if (!anchor || !head) return;
        session.presence.publish({ field: "body", revision: head.revision, anchor: anchor.pos, head: head.pos });
      },
    };
  }, [session, nameOf, canWrite]);

  const flush = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.key !== key) return true;
    return current.stream.flush();
  }, [key]);

  const hasUnsavedChanges = useCallback(() => {
    const current = sessionRef.current;
    return !!current && current.key === key && current.stream.hasPending();
  }, [key]);

  return {
    status: key ? status : "unavailable",
    // A reopened description paints the text its stream already holds.
    doc: session ? ((session.stream.detachedDoc() as JSONContent | null) ?? session.snapshot.doc) : null,
    collaboration,
    flush,
    hasUnsavedChanges,
  };
}
