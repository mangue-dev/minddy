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
import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as PMNode, type Schema } from "@tiptap/pm/model";

import { pageExtensions } from "@/components/pages/page-extensions";
import { MENTION_HYDRATION_META } from "@/components/markdown-mention";
import {
  caretColor,
  type BodyCollaboration,
  type CaretView,
} from "@/components/pages/page-collaboration";
import {
  COLLAB_BEACON_MAX_BYTES,
  CollabFatalError,
  CollabStream,
  type CollabTransport,
} from "./page-collaboration-stream";
import type {
  CollabCatchUp,
  CollabRefusal,
  CollabSubmission,
  CollabSubmitResult,
  PageCollaborationSnapshot,
} from "./page-collaboration";
import {
  descriptionCollaborationTopic,
  descriptionCollaborationUrl,
  takeDescriptionSnapshot,
  type DescriptionCatchUp,
  type DescriptionKind,
  type DescriptionSnapshot,
} from "./description-collaboration";
import { onDocumentHead } from "./document-collaboration-signals";
import {
  openPageCollaborationPresence,
  type PageCollaborationPresence,
  type PeerCaret,
} from "./page-collaboration-presence";
import { mergeDocs, type PageDocJSON } from "./pages-merge";

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

let documentSchemaCache: Schema | null = null;

/** The description schema, for a stream with no editor attached. */
function documentSchema(): Schema {
  documentSchemaCache ??= getSchema(pageExtensions({ headless: true, blocks: "document" }));
  return documentSchemaCache;
}

function sessionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

class DescriptionApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok && response.status !== 409 && response.status !== 422) {
    throw new DescriptionApiError(response.status,
      (data as { error?: string } | null)?.error ?? "Request failed");
  }
  return data as T;
}

const endpoint = descriptionCollaborationUrl;

/** The stream reads a page-shaped snapshot: a description is its body. */
function asStreamSnapshot(snapshot: DescriptionSnapshot): PageCollaborationSnapshot {
  return {
    protocol: snapshot.protocol,
    pageId: snapshot.documentId,
    projectId: snapshot.projectId,
    body: { revision: snapshot.revision, doc: snapshot.doc },
    title: { revision: 0, text: "" },
    version: 0,
    updatedAt: "",
  };
}

function transportFor(kind: DescriptionKind, id: string): CollabTransport {
  const fatal = (error: unknown) =>
    error instanceof DescriptionApiError && [401, 403, 404].includes(error.status)
      ? new CollabFatalError(error.message)
      : error;
  const post = (submission: CollabSubmission, keepalive = false) =>
    fetch(endpoint(kind, id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
      keepalive,
    });
  return {
    steps: async (_field, since): Promise<CollabCatchUp> => {
      try {
        const answer = await readJson<DescriptionCatchUp>(
          await fetch(`${endpoint(kind, id)}?since=${since}`, { cache: "no-store" }));
        return answer.kind === "reset"
          ? { kind: "reset", reason: answer.reason, snapshot: asStreamSnapshot(answer.snapshot) }
          : answer;
      } catch (error) {
        throw fatal(error);
      }
    },
    submit: async (submission): Promise<CollabSubmitResult> => {
      try {
        return await readJson<CollabSubmitResult>(await post(submission));
      } catch (error) {
        throw fatal(error);
      }
    },
    beacon: (submission) => {
      void post(submission, true).catch(() => {});
    },
  };
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
    void takeDescriptionSnapshot(kind, id, controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        // A plan's document has its own id; a description's is its parent's.
        if (snapshot.kind !== kind || (kind !== "plan" && snapshot.documentId !== id)) {
          setStatus("unavailable", key);
          return;
        }
        canWriteRef.current = snapshot.canWrite;
        const clientId = sessionId();
        const attachedListeners = new Set<(attached: boolean) => void>();
        const stream = new CollabStream({
          field: "body",
          clientId,
          revision: snapshot.revision,
          transport: transportFor(kind, id),
          schema: documentSchema,
          docFromSnapshot: (next, schema) => PMNode.fromJSON(schema, next.body.doc),
          toJSON: (doc) => doc.toJSON(),
          fromJSON: (schema, json) => PMNode.fromJSON(schema, json),
          // A reset with local work keeps it block by block; contested blocks
          // keep the local version (descriptions have no conflict banner).
          merge: (base, mine, theirs) => {
            const merged = mergeDocs(base.toJSON() as PageDocJSON, mine.toJSON() as PageDocJSON,
              theirs.toJSON() as PageDocJSON);
            try {
              return { doc: PMNode.fromJSON(mine.type.schema, merged.doc) };
            } catch {
              return { doc: mine };
            }
          },
          isPresentation: (origin) => origin.getMeta(MENTION_HYDRATION_META) === true,
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
      stream.beacon(COLLAB_BEACON_MAX_BYTES);
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
          color: caretColor(peer.userId),
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
