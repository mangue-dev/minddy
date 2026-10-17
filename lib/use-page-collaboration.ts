"use client";

// The LIVE SESSION of an open page (MIN-688): both step streams, the title
// binding, the wake-ups, recovery and the collaborators' carets.
//
// One session per page surface, created from a snapshot of both streams. It is
// kept in refs, not in effects: Activity runs effect cleanups when it hides a
// retained page, and closing the streams there would drop whatever had not
// been confirmed yet. Effects only own what must stop with visibility —
// subscriptions, timers and caret presence. A session left behind by an
// unmounted surface holds no timer once its pending steps are confirmed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import type { JSONContent } from "@tiptap/core";

import {
  PageApiError,
  fetchPageCollaborationApi,
  fetchPageCollaborationStepsApi,
  submitPageCollaborationApi,
} from "./pages-api";
import {
  MAX_PAGE_TITLE_LENGTH,
  diffDocSteps,
  pageBodySchema,
  pageTitleSchema,
  titleDocFromText,
} from "./page-collaboration-document";
import {
  CollabFatalError,
  CollabStream,
  collabPlugin,
  type CollabHost,
  type CollabStreamStatus,
  type CollabTransport,
} from "./page-collaboration-stream";
import type {
  CollabField,
  CollabRefusal,
  PageCollaborationSnapshot,
} from "./page-collaboration";
import { onPageStreamHeads } from "./page-collaboration-signals";
import {
  openPageCollaborationPresence,
  type PageCollaborationPresence,
  type PeerCaret,
} from "./page-collaboration-presence";
import { applyRestore, mergeDocs, type PageBlockConflict, type PageDocJSON } from "./pages-merge";
import { MENTION_HYDRATION_META } from "@/components/markdown-mention";
import {
  caretColor,
  type BodyCollaboration,
  type CaretView,
} from "@/components/pages/page-collaboration";

/** A collaborator's caret in the title, in textarea offsets. */
export interface TitleCaretView {
  sessionId: string;
  name: string;
  color: string;
  anchor: number;
  head: number;
}

export interface LiveTitle {
  value: string;
  maxLength: number;
  /** The textarea's new value after a local input. */
  input: (value: string) => void;
  /** Binds the textarea, so remote steps keep its selection and composition. */
  fieldRef: (field: HTMLTextAreaElement | null) => void;
  /** Publish the textarea's selection (on select, keyup, focus) or blur. */
  publishCaret: (field: HTMLTextAreaElement | null) => void;
  carets: TitleCaretView[];
}

export type LiveSaveState = "saved" | "saving" | "error";

export interface PageCollaborationSession {
  /** `unavailable` falls back to snapshot saving (an old server, a failed read). */
  status: "loading" | "ready" | "unavailable";
  snapshot: PageCollaborationSnapshot | null;
  body: BodyCollaboration | null;
  title: LiveTitle | null;
  saveState: LiveSaveState;
  /** Blocks a reset could not merge silently (see `mergeDocs`). */
  conflicts: PageBlockConflict[];
  restoreConflict: (conflict: PageBlockConflict) => void;
  dismissConflicts: () => void;
  /** Sends everything pending; false while work remains unconfirmed. */
  flush: () => Promise<boolean>;
  hasUnsavedChanges: () => boolean;
  /** Keepalive delivery when the tab unloads (not an acknowledgement). */
  beacon: () => void;
}

interface Member {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
}

function sessionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function transportFor(
  projectId: string,
  pageId: string
): CollabTransport {
  const fatal = (error: unknown) =>
    error instanceof PageApiError && [401, 403, 404].includes(error.status)
      ? new CollabFatalError(error.message)
      : error;
  return {
    steps: async (field, since) => {
      try {
        return await fetchPageCollaborationStepsApi(projectId, pageId, field, since);
      } catch (error) {
        throw fatal(error);
      }
    },
    submit: async (submission) => {
      try {
        return await submitPageCollaborationApi(projectId, pageId, submission);
      } catch (error) {
        throw fatal(error);
      }
    },
    beacon: (submission) => {
      void submitPageCollaborationApi(projectId, pageId, submission, { keepalive: true })
        .catch(() => {});
    },
  };
}

/** The title's headless editor state, bound to the textarea. */
class TitleSession {
  state: EditorState;
  field: HTMLTextAreaElement | null = null;
  composing = false;
  private listeners = new Set<(value: string) => void>();
  private detachField: (() => void) | null = null;

  constructor(readonly stream: CollabStream, text: string, clientId: string) {
    this.state = EditorState.create({
      doc: titleDocFromText(text),
      plugins: [collabPlugin(stream.version, clientId)],
    });
  }

  get value(): string {
    return this.state.doc.textContent;
  }

  subscribe(listener: (value: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const value = this.value;
    for (const listener of this.listeners) listener(value);
  }

  host(): CollabHost {
    return {
      getState: () => this.state,
      ready: () => !this.composing,
      dispatch: (tr: Transaction) => this.dispatch(tr),
    };
  }

  /** A received (or reset) transaction: apply it and keep the caret in place. */
  private dispatch(tr: Transaction): void {
    this.state = this.state.apply(tr);
    if (!tr.docChanged) return;
    const field = this.field;
    if (field) {
      const focused = field.ownerDocument.activeElement === field;
      const start = tr.mapping.map(field.selectionStart, -1);
      const end = tr.mapping.map(field.selectionEnd, 1);
      field.value = this.value;
      if (focused) field.setSelectionRange(start, end);
    }
    this.emit();
  }

  /** A local input: the textarea's new value, as steps. */
  input(value: string): void {
    const next = titleDocFromText(value.slice(0, MAX_PAGE_TITLE_LENGTH));
    const steps = diffDocSteps(this.state.doc, next);
    if (steps.length === 0) return;
    const tr = this.state.tr;
    for (const step of steps) tr.step(step);
    this.state = this.state.apply(tr);
    this.stream.noteLocalChange();
    this.emit();
  }

  bind(field: HTMLTextAreaElement | null): void {
    if (field === this.field) return;
    this.detachField?.();
    this.detachField = null;
    this.field = field;
    if (!field) return;
    const start = () => { this.composing = true; };
    const end = () => {
      this.composing = false;
      void this.stream.pull();
    };
    field.addEventListener("compositionstart", start);
    field.addEventListener("compositionend", end);
    this.detachField = () => {
      field.removeEventListener("compositionstart", start);
      field.removeEventListener("compositionend", end);
    };
  }
}

interface Session {
  key: string;
  snapshot: PageCollaborationSnapshot;
  body: CollabStream;
  title: TitleSession;
  bodyClientId: string;
  /** Latest peers, by field. */
  peers: PeerCaret[];
  /** The server refused a pill rebuild: stop sending them for this session. */
  hydrationRefused: boolean;
  caretListeners: Set<() => void>;
  attachedListeners: Set<(attached: boolean) => void>;
  presence: PageCollaborationPresence | null;
  status: Record<CollabField, CollabStreamStatus>;
}

export function usePageCollaboration({
  projectId,
  pageId,
  userId,
  canWrite,
  active,
  members,
  onRefused,
  onFatal,
}: {
  projectId: string;
  pageId: string;
  userId: string | null;
  canWrite: boolean;
  active: boolean;
  members: Member[];
  onRefused: (reason: CollabRefusal) => void;
  onFatal: (error: unknown) => void;
}): PageCollaborationSession {
  const key = `${projectId}:${pageId}`;
  const sessionRef = useRef<Session | null>(null);
  const [status, setStatus] = useState<PageCollaborationSession["status"]>(
    () => (sessionRef.current?.key === key ? "ready" : "loading"));
  const [, setRevision] = useState(0);
  const rerender = useCallback(() => setRevision((n) => n + 1), []);
  const [saveState, setSaveState] = useState<LiveSaveState>("saved");
  const [conflicts, setConflicts] = useState<PageBlockConflict[]>([]);
  const [titleValue, setTitleValue] = useState<string | null>(null);

  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;
  const onRefusedRef = useRef(onRefused);
  onRefusedRef.current = onRefused;
  const onFatalRef = useRef(onFatal);
  onFatalRef.current = onFatal;
  const membersRef = useRef(members);
  membersRef.current = members;

  /* ── Creating the session from a snapshot ──────────────────────────────── */
  useEffect(() => {
    if (sessionRef.current?.key === key) {
      setStatus("ready");
      return;
    }
    // The previous page's streams are not closed: detached, they keep sending
    // whatever was still unsaved, then hold no timer and can be collected.
    sessionRef.current = null;
    setStatus("loading");
    const controller = new AbortController();
    void fetchPageCollaborationApi(projectId, pageId, controller.signal).then((snapshot) => {
      if (controller.signal.aborted) return;
      if (snapshot.pageId !== pageId || snapshot.projectId !== projectId) {
        setStatus("unavailable");
        return;
      }
      const transport = transportFor(projectId, pageId);
      const statuses: Record<CollabField, CollabStreamStatus> = { body: "saved", title: "saved" };
      const reportStatus = (field: CollabField) => (next: CollabStreamStatus) => {
        statuses[field] = next;
        setSaveState(statuses.body === "error" || statuses.title === "error" ? "error"
          : statuses.body === "saving" || statuses.title === "saving" ? "saving" : "saved");
      };
      const bodyClientId = sessionId();
      const attachedListeners = new Set<(attached: boolean) => void>();
      const body = new CollabStream({
        field: "body",
        clientId: bodyClientId,
        revision: snapshot.body.revision,
        transport,
        schema: pageBodySchema,
        docFromSnapshot: (next, schema) => PMNode.fromJSON(schema, next.body.doc),
        toJSON: (doc) => doc.toJSON(),
        fromJSON: (schema, json) => PMNode.fromJSON(schema, json),
        merge: (base, mine, theirs) => {
          const merged = mergeDocs(base.toJSON() as PageDocJSON, mine.toJSON() as PageDocJSON,
            theirs.toJSON() as PageDocJSON);
          try {
            return { doc: PMNode.fromJSON(mine.type.schema, merged.doc), conflicts: merged.conflicts };
          } catch {
            return { doc: mine, conflicts: merged.conflicts };
          }
        },
        isPresentation: (origin) => origin.getMeta(MENTION_HYDRATION_META) === true,
        canSend: () => canWriteRef.current,
        onStatus: reportStatus("body"),
        onRefused: (reason) => {
          console.warn("[page-collaboration] body batch refused:", reason);
          // A pill rebuild nobody asked for is not the user's change to undo.
          if (reason === "presentation-changed") {
            if (sessionRef.current?.key === key) sessionRef.current.hydrationRefused = true;
            return;
          }
          onRefusedRef.current(reason);
        },
        onConflicts: (found) => setConflicts((current) => [...current, ...(found as PageBlockConflict[])]),
        onFatal: (error) => onFatalRef.current(error),
        onAttached: (attached) => {
          for (const listener of attachedListeners) listener(attached);
        },
      });
      const titleClientId = sessionId();
      const titleStream = new CollabStream({
        field: "title",
        clientId: titleClientId,
        revision: snapshot.title.revision,
        transport,
        schema: () => pageTitleSchema,
        docFromSnapshot: (next) => titleDocFromText(next.title.text),
        toJSON: (doc) => doc.textContent,
        fromJSON: (_schema, json) => titleDocFromText(String(json ?? "")),
        // A title is one line: the local text wins over a concurrent replacement.
        merge: (base, mine, theirs) => ({
          doc: mine.textContent === base.textContent ? theirs : mine,
        }),
        canSend: () => canWriteRef.current,
        onStatus: reportStatus("title"),
        onRefused: (reason) => {
          console.warn("[page-collaboration] title batch refused:", reason);
          onRefusedRef.current(reason);
        },
        onFatal: (error) => onFatalRef.current(error),
      });
      const title = new TitleSession(titleStream, snapshot.title.text, titleClientId);
      sessionRef.current = {
        key,
        snapshot,
        body,
        title,
        bodyClientId,
        peers: [],
        hydrationRefused: false,
        caretListeners: new Set(),
        attachedListeners,
        presence: null,
        status: statuses,
      };
      setTitleValue(title.value);
      setStatus("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("unavailable");
    });
    return () => controller.abort();
  }, [key, projectId, pageId]);

  /* ── What stops with visibility ────────────────────────────────────────── */
  const session = status === "ready" && sessionRef.current?.key === key ? sessionRef.current : null;
  useEffect(() => {
    if (!session) return;
    const { body, title } = session;
    title.stream.attach(title.host());
    const stopTitle = title.subscribe(setTitleValue);
    setTitleValue(title.value);

    // Wake-ups: the page row's stream heads, on the project broadcast.
    const stopHeads = onPageStreamHeads(pageId, (heads) => {
      if (heads.body !== null) body.noteRemoteHead(heads.body);
      if (heads.title !== null) title.stream.noteRemoteHead(heads.title);
    });
    // Recovery: a lost broadcast, a dead socket, a sleeping laptop.
    const catchUp = () => {
      if (document.visibilityState === "hidden") return;
      void body.pull();
      void title.stream.pull();
    };
    window.addEventListener("online", catchUp);
    window.addEventListener("focus", catchUp);
    window.addEventListener("pageshow", catchUp);
    document.addEventListener("visibilitychange", catchUp);
    catchUp();

    return () => {
      stopHeads();
      stopTitle();
      window.removeEventListener("online", catchUp);
      window.removeEventListener("focus", catchUp);
      window.removeEventListener("pageshow", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
      title.bind(null);
      title.stream.detach();
    };
  }, [session, pageId]);

  // Carets: only while this surface is shown.
  useEffect(() => {
    if (!session || !active || !userId) return;
    const presence = openPageCollaborationPresence({
      pageId,
      userId,
      sessionId: session.bodyClientId,
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
  }, [session, active, userId, pageId, rerender]);

  /* ── Bindings for the editor and the title ─────────────────────────────── */
  const nameOf = useCallback((id: string) => {
    const member = membersRef.current.find((candidate) => candidate.user_id === id);
    return member?.full_name?.trim() || member?.email?.split("@")[0] || "";
  }, []);

  const body = useMemo<BodyCollaboration | null>(() => {
    if (!session) return null;
    return {
      stream: session.body,
      clientId: session.bodyClientId,
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
        if (!selection || !canWriteRef.current) {
          session.presence.publish(null);
          return;
        }
        const anchor = session.body.toConfirmed(selection.anchor);
        const head = session.body.toConfirmed(selection.head);
        if (!anchor || !head) return;
        session.presence.publish({ field: "body", revision: head.revision, anchor: anchor.pos, head: head.pos });
      },
    };
  }, [session, nameOf, canWrite]);

  const titleCarets = session
    ? session.peers.filter((peer) => peer.field === "title").flatMap((peer): TitleCaretView[] => {
        const anchor = session.title.stream.fromConfirmed(peer.anchor, peer.revision);
        const head = session.title.stream.fromConfirmed(peer.head, peer.revision);
        if (anchor === null || head === null) return [];
        return [{
          sessionId: peer.sessionId,
          name: nameOf(peer.userId),
          color: caretColor(peer.userId),
          anchor,
          head,
        }];
      })
    : [];

  const titleSession = session?.title ?? null;
  const fieldRef = useCallback((field: HTMLTextAreaElement | null) => titleSession?.bind(field), [titleSession]);
  const titleInput = useCallback((value: string) => titleSession?.input(value), [titleSession]);
  const publishTitleCaret = useCallback((field: HTMLTextAreaElement | null) => {
    const presence = sessionRef.current?.presence;
    if (!presence || !titleSession) return;
    if (!field || !canWriteRef.current) {
      presence.publish(null);
      return;
    }
    const anchor = titleSession.stream.toConfirmed(field.selectionStart);
    const head = titleSession.stream.toConfirmed(field.selectionEnd);
    if (!anchor || !head) return;
    presence.publish({ field: "title", revision: head.revision, anchor: anchor.pos, head: head.pos });
  }, [titleSession]);

  // Rebuilt on every render on purpose: carets move with each presence update.
  const title: LiveTitle | null = titleSession ? {
    value: titleValue ?? titleSession.value,
    maxLength: MAX_PAGE_TITLE_LENGTH,
    input: titleInput,
    fieldRef,
    publishCaret: publishTitleCaret,
    carets: titleCarets,
  } : null;

  /* ── Saving and recovery ───────────────────────────────────────────────── */
  const flush = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.key !== key) return true;
    const [bodyDone, titleDone] = await Promise.all([current.body.flush(), current.title.stream.flush()]);
    return bodyDone && titleDone;
  }, [key]);

  const hasUnsavedChanges = useCallback(() => {
    const current = sessionRef.current;
    return !!current && current.key === key &&
      (current.body.hasPending() || current.title.stream.hasPending());
  }, [key]);

  const beacon = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.key !== key) return;
    current.body.beacon();
    current.title.stream.beacon();
  }, [key]);

  /**
   * Puts my version of a contested block back, as a local edit on the live
   * document: computed on the current screen, then sent like any keystroke.
   */
  const restoreConflict = useCallback((conflict: PageBlockConflict) => {
    setConflicts((current) => current.filter((item) => item.id !== conflict.id));
    sessionRef.current?.body.applyLocal((state) => {
      const doc = state.doc.toJSON() as PageDocJSON;
      const restored = applyRestore(doc, conflict, doc);
      try {
        return PMNode.fromJSON(state.schema, restored as JSONContent);
      } catch {
        return null;
      }
    });
  }, []);

  const dismissConflicts = useCallback(() => setConflicts([]), []);

  return {
    status,
    snapshot: session?.snapshot ?? null,
    body,
    title,
    saveState,
    conflicts,
    restoreConflict,
    dismissConflicts,
    flush,
    hasUnsavedChanges,
    beacon,
  };
}
