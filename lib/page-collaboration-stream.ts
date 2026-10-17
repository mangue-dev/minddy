/**
 * One live step stream of a page, on the client (MIN-688).
 *
 * `CollabStream` drives the `prosemirror-collab` contract against the page's
 * operation authority for ONE field — the body editor or the title — and
 * nothing else: no React, no DOM, no Supabase. The host it is attached to owns
 * the `EditorState` (a Tiptap editor for the body, a headless state for the
 * title textarea); the transport owns HTTP. That separation is what lets
 * lib/page-collaboration-stream.test.ts exercise two real collaborators against
 * an in-memory authority.
 *
 * ## The rules it keeps
 *
 * - **One batch in flight.** What is typed meanwhile waits in the collab
 *   plugin's unconfirmed steps and leaves with the next batch.
 * - **Accepted steps are consumed once, in revision order.** Catch-up reads are
 *   single-flight; a read whose base moved meanwhile is discarded and redone.
 *   Our own steps come back with our client ID, and `receiveTransaction`
 *   recognizes them instead of applying them twice.
 * - **An ambiguous failure is resolved by reading, not by guessing.** A batch
 *   whose response was lost may have been accepted: the next catch-up tells,
 *   because the journal carries our client ID. Only then is anything resent,
 *   with a new batch ID, from the rebased steps.
 * - **A refusal is definitive** for those steps: they are reverted locally and
 *   reported, so the editor never keeps text the server will not store.
 * - **A gap resets, it does not guess.** When the journal cannot bridge the
 *   client's revision, the client restarts from the snapshot and re-expresses
 *   its own unconfirmed work on top of it (see `rebuild`).
 */

import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { Step, type StepMap } from "@tiptap/pm/transform";
import { collab, getVersion, receiveTransaction, sendableSteps } from "prosemirror-collab";

import {
  COLLAB_MIN_SEND_INTERVAL_MS,
  COLLAB_RECONCILE_MS,
  COLLAB_SEND_DELAY_MS,
  MAX_COLLAB_BATCH_CHARS,
  MAX_COLLAB_BATCH_STEPS,
  type CollabCatchUp,
  type CollabField,
  type CollabRefusal,
  type CollabSubmission,
  type CollabSubmitResult,
  type PageCollaborationSnapshot,
} from "./page-collaboration";
import { diffDocSteps } from "./page-collaboration-document";
import { COLLAB_META, COLLAB_REBUILD_META } from "./page-collaboration-origin";

export {
  COLLAB_META,
  COLLAB_REBUILD_META,
  isCollabRemoteTransaction,
} from "./page-collaboration-origin";

export function collabPlugin(version: number, clientID: string) {
  return collab({ version, clientID });
}

interface Rebaseable {
  step: Step;
  inverted: Step;
  origin: Transaction;
}

function collabInternals(state: EditorState): { version: number; unconfirmed: Rebaseable[] } {
  const plugin = state.plugins.find(
    (candidate) => (candidate as unknown as { key: string }).key === COLLAB_META
  );
  const internals = plugin?.getState(state) as
    | { version: number; unconfirmed: Rebaseable[] }
    | undefined;
  if (!internals) throw new Error("The collab plugin is not installed on this state");
  return internals;
}

/** The document as the authority last confirmed it: the local one minus pending steps. */
export function confirmedDoc(state: EditorState): PMNode {
  const { unconfirmed } = collabInternals(state);
  const tr = state.tr;
  for (let i = unconfirmed.length - 1; i >= 0; i -= 1) tr.step(unconfirmed[i].inverted);
  return tr.doc;
}

export function hasUnconfirmed(state: EditorState): boolean {
  return collabInternals(state).unconfirmed.length > 0;
}

/** The editor state a stream reads and writes. */
export interface CollabHost {
  getState(): EditorState;
  dispatch(tr: Transaction): void;
  /** False while remote steps must wait (an IME composition in progress). */
  ready?(): boolean;
}

export interface CollabTransport {
  steps(field: CollabField, since: number): Promise<CollabCatchUp>;
  submit(submission: CollabSubmission): Promise<CollabSubmitResult>;
  /** Fire-and-forget delivery that survives the page unloading. */
  beacon?(submission: CollabSubmission): void;
}

/** A transport failure that no retry will fix (authorization, missing page). */
export class CollabFatalError extends Error {}

export type CollabStreamStatus = "saved" | "saving" | "error";

export interface CollabStreamOptions {
  field: CollabField;
  clientId: string;
  revision: number;
  transport: CollabTransport;
  /**
   * The schema to parse steps with while NO host is attached. An attached host
   * always wins: each Tiptap editor builds its own schema instance, and
   * ProseMirror refuses nodes from another instance ("Invalid content").
   */
  schema: () => Schema;
  /** The stream's document in a snapshot, built in `schema`. */
  docFromSnapshot: (snapshot: PageCollaborationSnapshot, schema: Schema) => PMNode;
  /** Serialize/parse documents across editors (each Tiptap editor builds its
   *  own schema instance, so nodes cannot move between them as objects). */
  toJSON: (doc: PMNode) => unknown;
  fromJSON: (schema: Schema, json: unknown) => PMNode;
  /**
   * Three-way merge used when a reset finds local unconfirmed work: `base` is
   * what the authority had confirmed to us, `mine` the screen, `theirs` the
   * snapshot. Returns the document to re-express as local steps.
   */
  merge: (base: PMNode, mine: PMNode, theirs: PMNode) => { doc: PMNode; conflicts?: unknown[] };
  /** Whether a local transaction is presentation-only (mention hydration). */
  isPresentation?: (origin: Transaction) => boolean;
  /** May this session send? A reader's session only receives. */
  canSend?: () => boolean;
  onStatus?: (status: CollabStreamStatus) => void;
  onRefused?: (reason: CollabRefusal) => void;
  onConflicts?: (conflicts: unknown[]) => void;
  onFatal?: (error: unknown) => void;
  /** After any change of the confirmed revision or the local document. */
  onChange?: () => void;
  /** A host was attached (true) or the stream fell back to its own state (false). */
  onAttached?: (attached: boolean) => void;
  sendDelayMs?: number;
  /** Shortest interval between two batches (`COLLAB_MIN_SEND_INTERVAL_MS`). */
  minSendIntervalMs?: number;
}

/** Confirmed step maps kept to place carets published at older revisions. */
const MAP_HISTORY = 1_000;

export class CollabStream {
  readonly field: CollabField;
  readonly clientId: string;

  private host: CollabHost | null = null;
  /** The stream's own state while no editor is attached (see `detach`). */
  private headless = false;
  private pendingAttach: CollabHost | null = null;
  private initialVersion: number;
  private closed = false;

  private inFlight = false;
  private lastSentAt = -Infinity;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private pulling: Promise<void> | null = null;
  private pullAgain = false;
  private status: CollabStreamStatus = "saved";
  private idleWaiters: Array<(ok: boolean) => void> = [];
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  /** `maps[i]` maps confirmed revision `mapsFrom + i` to the next one. */
  private maps: StepMap[] = [];
  private mapsFrom: number;

  constructor(private readonly options: CollabStreamOptions) {
    this.field = options.field;
    this.clientId = options.clientId;
    this.initialVersion = options.revision;
    this.mapsFrom = options.revision;
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────────── */

  /** The revision a NEW host must initialize its collab plugin with. */
  get version(): number {
    return this.host ? getVersion(this.host.getState()) : this.initialVersion;
  }

  /** Whether an editor (not the stream's own fallback state) is attached. */
  get attached(): boolean {
    return this.host !== null && !this.headless && this.pendingAttach === null;
  }

  /**
   * Binds an editor. When the stream was running on its own state — the
   * previous editor was destroyed — the new editor is rebased onto it first:
   * the confirmed document at the stream's revision, then the pending work
   * re-expressed as local steps. A batch in flight finishes before that, so its
   * acknowledgement still matches the steps it carried.
   */
  attach(host: CollabHost): void {
    if (this.closed) return;
    if (this.inFlight) {
      this.pendingAttach = host;
      return;
    }
    this.completeAttach(host);
  }

  private completeAttach(host: CollabHost): void {
    const previous = this.headless ? this.host : null;
    this.pendingAttach = null;
    this.host = host;
    this.headless = false;
    try {
      if (previous) {
        const state = previous.getState();
        const version = getVersion(state);
        const confirmed = this.options.toJSON(confirmedDoc(state));
        const screen = this.options.toJSON(state.doc);
        // Rebuilt in the NEW editor's schema: the previous state was built on
        // another editor's schema instance.
        const schema = host.getState().schema;
        const basis = this.options.fromJSON(schema, confirmed);
        try {
          this.rebuild(basis, version, this.options.fromJSON(schema, screen));
        } catch (error) {
          // Never leave the editor stuck read-only: fall back to the
          // confirmed document, which the next catch-up brings up to date.
          console.error("[page-collaboration] could not re-express pending work", error);
          this.rebuild(basis, version, basis);
        }
      }
    } catch (error) {
      console.error("[page-collaboration] reattachment failed", error);
    } finally {
      this.reconcileTimer ??= setInterval(() => {
        // A hidden tab waits: the session catches up when it is shown again.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        void this.pull();
      }, COLLAB_RECONCILE_MS);
      this.options.onAttached?.(true);
      void this.pull();
      this.scheduleSend(0);
    }
  }

  /**
   * The editor is going away (a hidden or evicted page, a recreated Tiptap
   * instance). The stream moves onto its OWN state — the confirmed document
   * and the very same pending steps — and keeps sending them, so nothing typed
   * is lost and its acknowledgements keep matching. No timer survives this:
   * an abandoned stream with nothing pending can be collected.
   */
  detach(host?: CollabHost): void {
    if (this.pendingAttach && (!host || this.pendingAttach === host)) {
      this.pendingAttach = null;
      return;
    }
    const current = this.host;
    if (!current || this.headless || (host && host !== current)) return;
    const state = current.getState();
    const { unconfirmed, version } = collabInternals(state);
    let own = EditorState.create({
      doc: confirmedDoc(state),
      plugins: [collabPlugin(version, this.clientId)],
    });
    if (unconfirmed.length > 0) {
      const tr = own.tr;
      for (const item of unconfirmed) tr.step(item.step);
      own = own.apply(tr);
    }
    const box = { state: own };
    this.host = {
      getState: () => box.state,
      dispatch: (tr) => {
        box.state = box.state.apply(tr);
      },
    };
    this.headless = true;
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    this.clearSendTimer();
    this.options.onAttached?.(false);
    if (unconfirmed.length > 0) this.scheduleSend(0);
  }

  close(): void {
    this.closed = true;
    this.clearSendTimer();
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    this.settleWaiters(false);
  }

  /** Pending local work, in the editor or carried by the stream itself. */
  hasPending(): boolean {
    if (this.inFlight) return true;
    return this.host ? hasUnconfirmed(this.host.getState()) : false;
  }

  getStatus(): CollabStreamStatus {
    return this.status;
  }

  /* ── Signals ────────────────────────────────────────────────────────────── */

  /** A local transaction changed the document. */
  noteLocalChange(): void {
    this.setStatus("saving");
    this.scheduleSend(this.options.sendDelayMs ?? COLLAB_SEND_DELAY_MS);
    this.options.onChange?.();
  }

  /**
   * A local edit computed from the current document (a restored conflict
   * block): applied through the attached editor and sent like any keystroke.
   */
  applyLocal(build: (state: EditorState) => PMNode | null): void {
    const host = this.host;
    if (!host || this.headless) return;
    const state = host.getState();
    const target = build(state);
    if (!target) return;
    const steps = diffDocSteps(state.doc, target);
    if (steps.length === 0) return;
    const tr = state.tr;
    for (const step of steps) tr.step(step);
    host.dispatch(tr);
  }

  /** Realtime announced a stream head; read only if it is ahead of us. */
  noteRemoteHead(head: number): void {
    if (head > this.version) void this.pull();
  }

  /**
   * Sends everything pending and waits for the authority's answer. Resolves
   * `false` while work remains unconfirmed (offline, refused, detached), so a
   * caller about to navigate or to start Numo knows the screen is not saved.
   */
  async flush(): Promise<boolean> {
    if (!this.hasPending()) return true;
    if (!this.host || this.closed) return false;
    this.clearSendTimer();
    const settled = new Promise<boolean>((resolve) => this.idleWaiters.push(resolve));
    void this.send();
    return settled;
  }

  /* ── Caret mapping ──────────────────────────────────────────────────────── */

  /**
   * A local position, in the coordinates of the last confirmed revision: what
   * a peer can map, because it knows that revision but not our pending steps.
   * Positions inside text we have not had confirmed fall back to their edge.
   */
  toConfirmed(pos: number, at?: EditorState): { revision: number; pos: number } | null {
    if (!this.host && !at) return null;
    const state = at ?? this.host!.getState();
    const { unconfirmed } = collabInternals(state);
    let mapped = pos;
    for (let i = unconfirmed.length - 1; i >= 0; i -= 1) {
      mapped = unconfirmed[i].inverted.getMap().map(mapped, -1);
    }
    return { revision: getVersion(state), pos: mapped };
  }

  /**
   * A peer's position published at `revision`, in this screen's coordinates,
   * or `null` when it cannot be placed: a revision we have not reached yet, or
   * one older than the maps we keep.
   */
  fromConfirmed(pos: number, revision: number, at?: EditorState): number | null {
    if (!this.host && !at) return null;
    const state = at ?? this.host!.getState();
    const version = getVersion(state);
    if (revision > version || revision < this.mapsFrom) return null;
    let mapped = pos;
    for (let at = revision; at < version; at += 1) {
      mapped = this.maps[at - this.mapsFrom].map(mapped, 1);
    }
    for (const item of collabInternals(state).unconfirmed) {
      mapped = item.step.getMap().map(mapped, 1);
    }
    return Math.max(0, Math.min(mapped, state.doc.content.size));
  }

  private recordConfirmed(steps: readonly Step[]): void {
    for (const step of steps) this.maps.push(step.getMap());
    const excess = this.maps.length - MAP_HISTORY;
    if (excess > 0) {
      this.maps.splice(0, excess);
      this.mapsFrom += excess;
    }
  }

  /* ── Sending ────────────────────────────────────────────────────────────── */

  private clearSendTimer(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
  }

  private scheduleSend(delay: number): void {
    if (this.closed || this.inFlight) return;
    this.clearSendTimer();
    const interval = this.options.minSendIntervalMs ?? COLLAB_MIN_SEND_INTERVAL_MS;
    const wait = Math.max(delay, interval - (Date.now() - this.lastSentAt));
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      void this.send();
    }, wait);
  }

  private setStatus(status: CollabStreamStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }

  private settleWaiters(ok: boolean): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve(ok);
  }

  private idle(): void {
    const pending = this.host ? hasUnconfirmed(this.host.getState()) : false;
    if (!pending) {
      this.failures = 0;
      this.setStatus("saved");
      this.settleWaiters(true);
    }
  }

  private async send(): Promise<void> {
    const host = this.host;
    if (this.closed || this.inFlight || !host) return;
    if (this.options.canSend && !this.options.canSend()) {
      this.settleWaiters(false);
      return;
    }
    const batch = this.nextBatch(host.getState());
    if (!batch) {
      this.idle();
      return;
    }
    const { steps, submission } = batch;
    this.inFlight = true;
    this.lastSentAt = Date.now();
    this.setStatus("saving");
    let result: CollabSubmitResult | null = null;
    let failure: unknown = null;
    try {
      result = await this.options.transport.submit(submission);
    } catch (error) {
      failure = error;
    }
    this.inFlight = false;
    if (this.closed) return;
    // The acknowledgement below applies to the state that carried the batch;
    // an editor that arrived meanwhile is rebased right after.
    const arriving = this.pendingAttach;

    if (failure) {
      if (arriving) this.completeAttach(arriving);
      if (failure instanceof CollabFatalError) {
        this.setStatus("error");
        this.settleWaiters(false);
        this.options.onFatal?.(failure);
        return;
      }
      // The batch may or may not have been accepted. The catch-up decides:
      // our client ID comes back with it if it was.
      this.failures += 1;
      this.setStatus("error");
      this.settleWaiters(false);
      const delay = Math.min(30_000, 500 * 2 ** Math.min(this.failures, 6));
      setTimeout(() => {
        if (this.closed) return;
        void this.pull().finally(() => this.scheduleSend(0));
      }, delay);
      return;
    }

    if (result?.status === "accepted") {
      this.failures = 0;
      const current = this.host?.getState();
      if (current && getVersion(current) === submission.base) {
        this.recordConfirmed(steps);
        this.host!.dispatch(receiveTransaction(current, steps, steps.map(() => this.clientId)));
      } else if (current) {
        // A catch-up already brought these steps back; read on from there.
        await this.pull();
      }
    } else if (result?.status === "behind") {
      await this.pull();
    } else if (result?.status === "refused") {
      this.revertUnconfirmed();
      this.options.onRefused?.(result.reason);
    }
    if (arriving && this.pendingAttach === arriving) this.completeAttach(arriving);
    this.options.onChange?.();
    if (this.host && hasUnconfirmed(this.host.getState())) this.scheduleSend(0);
    else this.idle();
  }

  /**
   * The next batch to send: a prefix of the unconfirmed steps, bounded in count
   * and size, and of one kind only — a presentation batch must hold
   * presentation steps alone, or the authority could not verify it.
   */
  private nextBatch(state: EditorState): { steps: Step[]; submission: CollabSubmission } | null {
    const sendable = sendableSteps(state);
    if (!sendable) return null;
    const origins = sendable.origins as Transaction[];
    const presentation = !!this.options.isPresentation?.(origins[0]);
    let count = 1;
    while (count < sendable.steps.length && count < MAX_COLLAB_BATCH_STEPS &&
      !!this.options.isPresentation?.(origins[count]) === presentation) count += 1;
    let steps = sendable.steps.slice(0, count);
    let json = steps.map((step) => step.toJSON());
    while (steps.length > 1 && JSON.stringify(json).length > MAX_COLLAB_BATCH_CHARS) {
      steps = steps.slice(0, Math.ceil(steps.length / 2));
      json = json.slice(0, steps.length);
    }
    return {
      steps,
      submission: {
        field: this.field,
        base: sendable.version,
        batchId: crypto.randomUUID(),
        clientId: this.clientId,
        steps: json,
        ...(presentation ? { presentation: true } : {}),
      },
    };
  }

  /**
   * Last-chance delivery as the tab unloads: the next batch, sent with
   * `keepalive`. It is not an acknowledgement — the unsaved-work guard still
   * applies — and a batch already in flight is left alone, since a second one
   * at the same base could only be refused.
   */
  beacon(): void {
    if (this.closed || this.inFlight || !this.host) return;
    if (this.options.canSend && !this.options.canSend()) return;
    const batch = this.nextBatch(this.host.getState());
    if (batch) this.options.transport.beacon?.(batch.submission);
  }

  /** Drops every pending local step from the screen (after a refusal). */
  private revertUnconfirmed(): void {
    const host = this.host;
    if (!host) return;
    const state = host.getState();
    const { unconfirmed, version } = collabInternals(state);
    if (unconfirmed.length === 0) return;
    const tr = state.tr;
    for (let i = unconfirmed.length - 1; i >= 0; i -= 1) tr.step(unconfirmed[i].inverted);
    tr.setMeta(COLLAB_META, { version, unconfirmed: [] }).setMeta("addToHistory", false);
    host.dispatch(tr);
  }

  /* ── Receiving ──────────────────────────────────────────────────────────── */

  /** Reads accepted steps until caught up. Single-flight; repeats if asked again. */
  pull(): Promise<void> {
    if (this.closed || !this.host) return Promise.resolve();
    if (this.pulling) {
      this.pullAgain = true;
      return this.pulling;
    }
    this.pulling = this.pullLoop().finally(() => {
      this.pulling = null;
    });
    return this.pulling;
  }

  private async pullLoop(): Promise<void> {
    do {
      this.pullAgain = false;
      const host = this.host;
      if (!host || this.closed) return;
      if (host.ready && !host.ready()) {
        // Remote steps wait for the composition to end.
        setTimeout(() => void this.pull(), 300);
        return;
      }
      const since = getVersion(host.getState());
      let answer: CollabCatchUp;
      try {
        answer = await this.options.transport.steps(this.field, since);
      } catch (error) {
        if (error instanceof CollabFatalError) {
          this.setStatus("error");
          this.options.onFatal?.(error);
        }
        return;
      }
      const now = this.host;
      if (!now || this.closed) return;
      // An acknowledgement or another read moved the base meanwhile.
      if (getVersion(now.getState()) !== since) {
        this.pullAgain = true;
        continue;
      }
      if (answer.kind === "reset") {
        this.applyReset(answer.snapshot);
        continue;
      }
      if (answer.steps.length > 0) {
        // The attached editor's own schema instance, never a shared one.
        const schema = now.getState().schema;
        let steps: Step[];
        try {
          steps = answer.steps.map((json) => Step.fromJSON(schema, json as Parameters<typeof Step.fromJSON>[1]));
        } catch {
          return;
        }
        this.recordConfirmed(steps);
        now.dispatch(receiveTransaction(now.getState(), steps, answer.clientIds, {
          mapSelectionBackward: true,
        }));
        this.options.onChange?.();
      }
      if (answer.to < answer.head) this.pullAgain = true;
    } while (this.pullAgain && !this.closed);
  }

  private applyReset(snapshot: PageCollaborationSnapshot): void {
    const host = this.host;
    if (!host) return;
    const revision = this.field === "body" ? snapshot.body.revision : snapshot.title.revision;
    const state = host.getState();
    const theirs = this.options.docFromSnapshot(snapshot, state.schema);
    // Older maps describe a history the snapshot replaced.
    this.maps = [];
    this.mapsFrom = revision;
    if (!hasUnconfirmed(state)) {
      this.rebuild(theirs, revision, theirs);
      return;
    }
    const merged = this.options.merge(confirmedDoc(state), state.doc, theirs);
    if (merged.conflicts && merged.conflicts.length > 0) {
      this.options.onConflicts?.(merged.conflicts);
    }
    this.rebuild(theirs, revision, merged.doc);
  }

  /**
   * Re-bases the host on `basis` at `revision`, then re-expresses `mine` as
   * fresh local steps — what a reset and a reattachment both need.
   */
  private rebuild(basis: PMNode, revision: number, mine: PMNode): void {
    const host = this.host;
    if (!host) return;
    let state = host.getState();
    // Documents from another schema instance cannot enter this state.
    const own = (doc: PMNode) => doc.type.schema === state.schema
      ? doc : this.options.fromJSON(state.schema, this.options.toJSON(doc));
    basis = own(basis);
    mine = own(mine);
    const reset = state.tr
      .replaceWith(0, state.doc.content.size, basis.content)
      .setMeta(COLLAB_META, { version: revision, unconfirmed: [] })
      .setMeta("addToHistory", false);
    host.dispatch(reset);
    state = host.getState();
    const steps = diffDocSteps(state.doc, mine);
    if (steps.length === 0) return;
    const local = state.tr;
    for (const step of steps) local.step(step);
    local.setMeta(COLLAB_REBUILD_META, true).setMeta("addToHistory", false);
    host.dispatch(local);
    this.noteLocalChange();
  }
}
