import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Node as PMNode, type Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Step } from "@tiptap/pm/transform";
import { history, undo } from "@tiptap/pm/history";
import { getSchema } from "@tiptap/core";
import { pageExtensions } from "@/components/pages/page-extensions";

import {
  CollabFatalError,
  CollabStream,
  collabPlugin,
  COLLAB_BEACON_MAX_BYTES,
  type CollabHost,
  type CollabStreamOptions,
  type CollabTransport,
} from "./page-collaboration-stream";
import {
  assembleCollabSteps,
  MAX_COLLAB_BATCH_CHARS,
  type CollabCatchUp,
  type CollabSubmission,
  type CollabSubmitResult,
  type PageCollaborationSnapshot,
} from "./page-collaboration";
import {
  applyCollabSteps,
  canonicalBodyJSON,
  pageBodySchema,
  pageTitleSchema,
  titleDocFromText,
} from "./page-collaboration-document";

/**
 * An in-memory operation authority with the server's acceptance rule: a batch
 * applies only at the head, through the same `applyCollabSteps` the server
 * uses, and the journal can be truncated to force a reset.
 */
class Authority {
  doc: unknown;
  journal: { base: number; stepCount: number; clientId: string; steps: unknown[] }[] = [];
  head = 0;
  floor = 0;
  /** When set, the next submit commits but its response is lost. */
  loseNextResponse = false;
  submits = 0;

  constructor(readonly field: "body" | "title", initial: unknown) {
    this.doc = initial;
  }

  snapshot(): PageCollaborationSnapshot {
    return {
      protocol: 1,
      pageId: "p",
      projectId: "x",
      body: { revision: this.field === "body" ? this.head : 0, doc: (this.field === "body" ? this.doc : { type: "doc", content: [] }) as never },
      title: { revision: this.field === "title" ? this.head : 0, text: this.field === "title" ? String(this.doc) : "" },
      version: 1,
      updatedAt: "",
    };
  }

  /** A writer replacing the document without steps (opens a gap). */
  replace(value: unknown): void {
    this.doc = value;
    this.head += 1;
  }

  transport(): CollabTransport {
    return {
      steps: async (_field, since): Promise<CollabCatchUp> => {
        if (since > this.head || since < this.floor) {
          return { kind: "reset", reason: "gap", snapshot: this.snapshot() };
        }
        const page = assembleCollabSteps(this.field, since, this.head, this.journal.filter((row) => row.base >= this.floor));
        if ("gap" in page) return { kind: "reset", reason: "gap", snapshot: this.snapshot() };
        return { kind: "steps", ...page };
      },
      submit: async (submission: CollabSubmission): Promise<CollabSubmitResult> => {
        this.submits += 1;
        if (submission.base !== this.head) return { status: "behind", head: this.head };
        const current = this.field === "body" ? this.doc : String(this.doc);
        const applied = applyCollabSteps(this.field, current, submission.steps);
        if (!applied.ok) return { status: "refused", reason: applied.reason };
        this.doc = this.field === "body" ? applied.doc : applied.text;
        this.journal.push({ base: this.head, stepCount: submission.steps.length, clientId: submission.clientId, steps: submission.steps });
        this.head += submission.steps.length;
        if (this.loseNextResponse) {
          this.loseNextResponse = false;
          throw new Error("network: response lost");
        }
        return { status: "accepted", revision: this.head };
      },
    };
  }
}

/**
 * The authority as deployed: an accepted batch is only journaled, the stored
 * document lags behind until `materialize()`, and a snapshot is the stored
 * document plus the pending journal — what `liveFromRow` serves.
 */
class JournalAuthority extends Authority {
  stored: unknown;
  storedRevision = 0;

  constructor(field: "body" | "title", initial: unknown) {
    super(field, initial);
    this.stored = initial;
  }

  /** The stored document with every pending step applied. */
  live(): unknown {
    const steps = this.journal.filter((row) => row.base >= this.storedRevision).flatMap((row) => row.steps);
    if (steps.length === 0) return this.stored;
    const applied = applyCollabSteps(this.field, this.stored, steps);
    if (!applied.ok) throw new Error(`pending steps do not apply: ${applied.reason}`);
    return this.field === "body" ? applied.doc : applied.text;
  }

  materialize(): void {
    this.stored = this.live();
    this.storedRevision = this.head;
  }

  override snapshot(): PageCollaborationSnapshot {
    const accepted = this.doc;
    this.doc = this.live();
    try {
      return super.snapshot();
    } finally {
      this.doc = accepted;
    }
  }
}

/** One collaborator: a headless editor state with the collab and history plugins. */
class Client {
  state: EditorState;
  stream: CollabStream;
  refused: string[] = [];
  /** Later steps lost with each refusal, in order. */
  dropped: number[] = [];

  fatal: unknown[] = [];
  discarded = 0;

  constructor(authority: Authority, readonly schema: Schema, id: string, transport?: CollabTransport,
    extra: Partial<CollabStreamOptions> = {}) {
    const snapshot = authority.snapshot();
    const field = authority.field;
    // Like Tiptap, each body editor builds ITS OWN schema instance; the stream
    // only receives the shared one, as lib/use-page-collaboration.ts does.
    // Nodes of two instances cannot be mixed, which this fixture must expose.
    const editorSchema = field === "body" ? getSchema(pageExtensions({ headless: true })) : schema;
    const doc = field === "body"
      ? PMNode.fromJSON(editorSchema, snapshot.body.doc)
      : titleDocFromText(snapshot.title.text);
    this.stream = new CollabStream({
      field,
      clientId: id,
      revision: field === "body" ? snapshot.body.revision : snapshot.title.revision,
      transport: transport ?? authority.transport(),
      schema: () => schema,
      docFromSnapshot: (next, into) => field === "body"
        ? PMNode.fromJSON(into, next.body.doc)
        : titleDocFromText(next.title.text),
      toJSON: (node) => node.toJSON(),
      fromJSON: (s, json) => PMNode.fromJSON(s, json),
      // Theirs wins in this fixture; the real body merge is lib/pages-merge.ts.
      merge: (_base, mine) => ({ doc: mine }),
      onRefused: (reason, dropped) => {
        this.refused.push(reason);
        this.dropped.push(dropped);
      },
      onFatal: (error) => this.fatal.push(error),
      onDiscarded: () => { this.discarded += 1; },
      sendDelayMs: 0,
      minSendIntervalMs: 0,
      ...extra,
    });
    this.state = EditorState.create({
      doc,
      plugins: [history(), collabPlugin(this.stream.version, id)],
    });
    this.stream.attach(this.host());
  }

  host(): CollabHost {
    return {
      getState: () => this.state,
      dispatch: (tr: Transaction) => {
        this.state = this.state.apply(tr);
      },
    };
  }

  /** A local edit, then the stream is told. */
  edit(build: (tr: Transaction) => Transaction): void {
    this.state = this.state.apply(build(this.state.tr));
    this.stream.noteLocalChange();
  }

  text(): string {
    return this.state.doc.textContent;
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i += 1) await vi.advanceTimersByTimeAsync(5);
}

const paragraph = (text: string) => canonicalBodyJSON({
  type: "doc",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CollabStream — two collaborators in the same paragraph", () => {
  it("converges when both type at the same moment", async () => {
    const authority = new Authority("body", paragraph("Hello world"));
    const schema = pageBodySchema();
    const alice = new Client(authority, schema, "alice-session");
    const bob = new Client(authority, schema, "bob-session");

    // Alice types after "Hello", Bob at the end, before either is confirmed.
    alice.edit((tr) => tr.insertText(" there", 6));
    bob.edit((tr) => tr.insertText("!", 12));
    await settle();
    await alice.stream.pull();
    await bob.stream.pull();
    await settle();

    expect(alice.text()).toBe("Hello there world!");
    expect(bob.text()).toBe(alice.text());
    expect(PMNode.fromJSON(schema, authority.doc).textContent).toBe(alice.text());
    expect(alice.stream.hasPending()).toBe(false);
    expect(bob.stream.hasPending()).toBe(false);
  });

  it("converges on interleaved deletions and insertions in one word", async () => {
    const authority = new Authority("body", paragraph("abcdef"));
    const schema = pageBodySchema();
    const alice = new Client(authority, schema, "alice-session");
    const bob = new Client(authority, schema, "bob-session");

    alice.edit((tr) => tr.delete(2, 5)); // removes "bcd"
    bob.edit((tr) => tr.insertText("X", 4)); // inside the removed range
    await settle();
    await alice.stream.pull();
    await bob.stream.pull();
    await settle();

    expect(alice.text()).toBe(bob.text());
    expect(PMNode.fromJSON(schema, authority.doc).textContent).toBe(alice.text());
  });

  it("does not apply its own batch twice when the response is lost after the commit", async () => {
    const authority = new Authority("body", paragraph("Note"));
    const schema = pageBodySchema();
    const alice = new Client(authority, schema, "alice-session");
    authority.loseNextResponse = true;

    alice.edit((tr) => tr.insertText(" one", 5));
    await settle();
    // The retry reads first: the journal carries Alice's client ID.
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();

    expect(alice.text()).toBe("Note one");
    expect(PMNode.fromJSON(schema, authority.doc).textContent).toBe("Note one");
    expect(authority.head).toBe(1);
    expect(alice.stream.hasPending()).toBe(false);
  });

  it("re-expresses pending work on top of a reset snapshot", async () => {
    const authority = new Authority("body", paragraph("Draft"));
    const schema = pageBodySchema();
    const offline: CollabTransport = {
      steps: authority.transport().steps,
      submit: async () => { throw new Error("offline"); },
    };
    const alice = new Client(authority, schema, "alice-session", offline);
    alice.edit((tr) => tr.insertText(" kept", 6));
    await settle();

    // Another writer replaced the page without steps: a gap.
    authority.replace(paragraph("Replaced"));
    await alice.stream.pull();
    await settle();

    // The fixture merge keeps mine, expressed as steps on the new basis.
    expect(alice.text()).toBe("Draft kept");
    expect(alice.stream.hasPending()).toBe(true);
    expect(alice.stream.version).toBe(authority.head);
  });

  it("keeps pending work when the editor is destroyed, and rebases the next one onto it", async () => {
    const authority = new Authority("body", paragraph("Shared"));
    const schema = pageBodySchema();
    const alice = new Client(authority, schema, "alice-session");
    const bob = new Client(authority, schema, "bob-session");
    let release!: () => void;
    let held = false;
    const slow: CollabTransport = {
      steps: authority.transport().steps,
      // Only the first batch is held back; its retry goes straight through.
      submit: (submission) => {
        if (held) return authority.transport().submit(submission);
        held = true;
        return new Promise((resolve) => {
          release = () => void authority.transport().submit(submission).then(resolve);
        });
      },
    };
    const carol = new Client(authority, schema, "carol-session", slow);

    // Carol types; her batch is in flight when her editor is destroyed.
    carol.edit((tr) => tr.insertText(" by Carol", 7));
    await settle();
    carol.stream.detach();
    // While no editor is attached, Bob edits and Carol's batch is accepted.
    bob.edit((tr) => tr.insertText("Fully ", 1));
    await settle();
    release();
    await settle();

    // A new editor, built from Carol's last screen at her last revision.
    const reborn = new Client(authority, schema, "unused");
    reborn.stream.close();
    reborn.state = EditorState.create({
      doc: carol.state.doc,
      plugins: [history(), collabPlugin(carol.stream.version, "carol-session")],
    });
    carol.state = reborn.state;
    carol.stream.attach(carol.host());
    await settle();
    await alice.stream.pull();
    await bob.stream.pull();

    expect(carol.text()).toBe("Fully Shared by Carol");
    expect(alice.text()).toBe(carol.text());
    expect(bob.text()).toBe(carol.text());
    expect(carol.stream.hasPending()).toBe(false);
  });

  it("undoes only the local edit after a remote one", async () => {
    const authority = new Authority("body", paragraph("one two"));
    const schema = pageBodySchema();
    const alice = new Client(authority, schema, "alice-session");
    const bob = new Client(authority, schema, "bob-session");

    alice.edit((tr) => tr.insertText(" A", 4));
    await settle();
    bob.edit((tr) => tr.insertText(" B", 1));
    await settle();
    await alice.stream.pull();

    undo(alice.state, (tr) => {
      alice.state = alice.state.apply(tr);
    });
    alice.stream.noteLocalChange();
    await settle();
    await bob.stream.pull();

    expect(alice.text()).toBe(" Bone two");
    expect(bob.text()).toBe(alice.text());
  });

  it("reverts refused steps instead of keeping text the server will not store", async () => {
    const authority = new Authority("title", "Plan");
    const alice = new Client(authority, pageTitleSchema, "alice-session");
    alice.edit((tr) => tr.insertText("x".repeat(600), 4));
    await settle();

    expect(alice.refused).toEqual(["title-too-long"]);
    expect(alice.text()).toBe("Plan");
    expect(alice.stream.hasPending()).toBe(false);
  });

  it("stops on a fatal transport error, reverts what can never be saved and lets the page go", async () => {
    const authority = new Authority("title", "Plan");
    let submits = 0;
    const fatal: CollabTransport = {
      steps: authority.transport().steps,
      submit: async () => { submits += 1; throw new CollabFatalError("forbidden"); },
    };
    const alice = new Client(authority, pageTitleSchema, "alice-session", fatal);
    alice.edit((tr) => tr.insertText("!", 4));
    const flushed = alice.stream.flush();
    await settle();

    await expect(flushed).resolves.toBe(true);
    expect(alice.stream.hasPending()).toBe(false);
    expect(alice.text()).toBe("Plan");
    expect(alice.fatal).toHaveLength(1);
    expect(alice.stream.getStatus()).toBe("error");
    // Stopped for good: no retry loop, and new typing says it is not saved.
    alice.edit((tr) => tr.insertText("?", 4));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(submits).toBe(1);
    expect(alice.stream.getStatus()).toBe("error");
  });

  it("reverts only the refused batch and keeps what was typed while it was in flight", async () => {
    const authority = new Authority("body", paragraph("Hello"));
    const schema = pageBodySchema();
    let release: (() => void) | null = null;
    const gated: CollabTransport = {
      steps: authority.transport().steps,
      submit: async (submission) => {
        if (authority.submits === 0) {
          authority.submits += 1;
          await new Promise<void>((resolve) => { release = resolve; });
          return { status: "refused", reason: "presentation-changed" };
        }
        return authority.transport().submit(submission);
      },
    };
    const alice = new Client(authority, schema, "alice-session", gated);
    alice.edit((tr) => tr.insertText("X", 1)); // the batch that will be refused
    await settle();
    expect(release).not.toBeNull();
    alice.edit((tr) => tr.insertText(" world", 7)); // typed while it is in flight
    release!();
    await settle();
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();

    expect(alice.refused).toEqual(["presentation-changed"]);
    expect(alice.text()).toBe("Hello world");
    expect(PMNode.fromJSON(schema, authority.doc).textContent).toBe("Hello world");
    expect(alice.discarded).toBe(0);
  });

  it("keeps undo working for the typing kept after a refusal", async () => {
    const authority = new Authority("body", paragraph("Hello"));
    const schema = pageBodySchema();
    let release: (() => void) | null = null;
    const gated: CollabTransport = {
      steps: authority.transport().steps,
      submit: async (submission) => {
        if (authority.submits === 0) {
          authority.submits += 1;
          await new Promise<void>((resolve) => { release = resolve; });
          return { status: "refused", reason: "content-refused" };
        }
        return authority.transport().submit(submission);
      },
    };
    const alice = new Client(authority, schema, "alice-session", gated);
    alice.edit((tr) => tr.insertText("X", 1));
    await settle();
    alice.edit((tr) => tr.insertText(" world", 7));
    release!();
    await settle();
    expect(alice.text()).toBe("Hello world");

    // Undo removes the kept typing and never brings the refused text back.
    const host = alice.host();
    undo(alice.state, host.dispatch);
    expect(alice.text()).toBe("Hello");
    undo(alice.state, host.dispatch);
    expect(alice.text()).toBe("Hello");
  });

  it("sends a paste larger than a batch so the server refuses it, instead of stalling", async () => {
    const authority = new Authority("body", paragraph("Hello"));
    const schema = pageBodySchema();
    const sizes: number[] = [];
    const transport: CollabTransport = {
      steps: authority.transport().steps,
      submit: async (submission) => {
        sizes.push(new TextEncoder().encode(JSON.stringify(submission.steps)).length);
        return { status: "refused", reason: "too-large" };
      },
    };
    const alice = new Client(authority, schema, "alice-session", transport);
    // One step of about 420 KB once encoded: over the batch limit on its own.
    alice.edit((tr) => tr.insertText("\u00e9".repeat(210_000), 1));
    const flushed = alice.stream.flush();
    await settle();

    expect(sizes).toHaveLength(1);
    expect(sizes[0]).toBeGreaterThan(MAX_COLLAB_BATCH_CHARS);
    expect(alice.refused).toEqual(["too-large"]);
    expect(alice.text()).toBe("Hello");
    await expect(flushed).resolves.toBe(true);
  });

  it("splits batches by encoded bytes, so multibyte text fits the route limit", async () => {
    const authority = new Authority("body", paragraph("Hello"));
    const schema = pageBodySchema();
    const sizes: number[] = [];
    const base = authority.transport();
    const transport: CollabTransport = {
      steps: base.steps,
      submit: (submission) => {
        sizes.push(new TextEncoder().encode(JSON.stringify(submission.steps)).length);
        return base.submit(submission);
      },
    };
    const alice = new Client(authority, schema, "alice-session", transport, { sendDelayMs: 60_000 });
    // Three pastes of 60,000 three-byte characters: 540 KB in all.
    for (let i = 0; i < 3; i += 1) alice.edit((tr) => tr.insertText("\u6f22".repeat(60_000), 1));
    const flushed = alice.stream.flush();
    await settle();
    await expect(flushed).resolves.toBe(true);

    expect(sizes.length).toBeGreaterThan(1);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(MAX_COLLAB_BATCH_CHARS);
    expect(PMNode.fromJSON(schema, authority.doc).textContent).toHaveLength(5 + 180_000);
  });

  it("backs off when the server keeps answering behind without progress", async () => {
    const authority = new Authority("body", paragraph("Hello"));
    const schema = pageBodySchema();
    let submits = 0;
    const stuck: CollabTransport = {
      steps: authority.transport().steps,
      submit: async (submission) => {
        submits += 1;
        return { status: "behind", head: submission.base };
      },
    };
    const alice = new Client(authority, schema, "alice-session", stuck);
    alice.edit((tr) => tr.insertText("!", 6));
    await vi.advanceTimersByTimeAsync(10_000);

    // Exponential backoff from 1 s: a handful of attempts, not one per tick.
    expect(submits).toBeGreaterThan(1);
    expect(submits).toBeLessThan(8);
  });

  it("reports later typing that cannot be rebased over a refused batch", async () => {
    const authority = new Authority("body", paragraph("Hello"));
    const schema = pageBodySchema();
    let release: (() => void) | null = null;
    const gated: CollabTransport = {
      steps: authority.transport().steps,
      submit: async (submission) => {
        if (authority.submits === 0) {
          authority.submits += 1;
          await new Promise<void>((resolve) => { release = resolve; });
          return { status: "refused", reason: "content-refused" };
        }
        return authority.transport().submit(submission);
      },
    };
    const alice = new Client(authority, schema, "alice-session", gated);
    alice.edit((tr) => tr.insertText("abc", 6));
    await settle();
    // Typed INSIDE the refused text: it has nowhere to go once it is removed.
    alice.edit((tr) => tr.insertText("Z", 8));
    release!();
    await settle();

    expect(alice.text()).toBe("Hello");
    // One report for the refusal and the typing lost with it.
    expect(alice.refused).toEqual(["content-refused"]);
    expect(alice.dropped).toEqual([1]);
    expect(alice.discarded).toBe(0);
    expect(alice.stream.hasPending()).toBe(false);
  });

  it("stops instead of looping when a catch-up holds steps it cannot read", async () => {
    const authority = new Authority("body", paragraph("Hello"));
    const schema = pageBodySchema();
    let reads = 0;
    let submits = 0;
    const skewed: CollabTransport = {
      steps: async (field, since) => {
        reads += 1;
        return { kind: "steps", field, from: since, to: since + 1, head: since + 1,
          clientIds: ["newer-client"],
          steps: [{ stepType: "replace", from: 1, to: 1,
            slice: { content: [{ type: "nodeFromTheFuture" }] } }] };
      },
      submit: async () => { submits += 1; return { status: "behind", head: 1 }; },
    };
    const alice = new Client(authority, schema, "alice-session", skewed);
    alice.edit((tr) => tr.insertText("!", 6));
    const flushed = alice.stream.flush();
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(flushed).resolves.toBe(true);
    expect(alice.fatal).toHaveLength(1);
    expect(alice.stream.getStatus()).toBe("error");
    expect(submits + reads).toBeLessThan(6);
  });

  it("settles the pending work of a writer who lost write access", async () => {
    const authority = new Authority("title", "Plan");
    let writable = true;
    const alice = new Client(authority, pageTitleSchema, "alice-session", undefined,
      { canSend: () => writable, sendDelayMs: 1_000 });
    alice.edit((tr) => tr.insertText("!", 4));
    writable = false;
    const flushed = alice.stream.flush();
    await settle();

    await expect(flushed).resolves.toBe(true);
    expect(alice.text()).toBe("Plan");
    expect(alice.discarded).toBe(1);
  });

  it("keeps a keepalive beacon under the browser's 64 KB limit", async () => {
    const authority = new Authority("body", paragraph(""));
    const schema = pageBodySchema();
    const beacons: string[] = [];
    const transport: CollabTransport = {
      ...authority.transport(),
      submit: () => new Promise(() => {}),
      beacon: (submission) => beacons.push(JSON.stringify(submission)),
    };
    const alice = new Client(authority, schema, "alice-session", transport, { sendDelayMs: 60_000 });
    for (let i = 0; i < 40; i += 1) alice.edit((tr) => tr.insertText("y".repeat(3_000), 1));
    alice.stream.beacon();

    expect(beacons).toHaveLength(1);
    expect(beacons[0].length).toBeLessThan(COLLAB_BEACON_MAX_BYTES + 1_000);
  });
});

describe("CollabStream — journal-only commits and materialization", () => {
  it("starts a joining session at the head while typing is still pending", async () => {
    const authority = new JournalAuthority("body", paragraph("Draft"));
    const schema = pageBodySchema();
    const alice = new Client(authority, schema, "alice-session");
    alice.edit((tr) => tr.insertText(" one", 6));
    await settle();
    expect(authority.head).toBe(1);
    // Nothing materialized: the stored document still lags.
    expect(PMNode.fromJSON(schema, authority.stored).textContent).toBe("Draft");

    const bob = new Client(authority, schema, "bob-session");
    expect(bob.text()).toBe("Draft one");
    bob.edit((tr) => tr.insertText(" two", 10));
    await settle();
    await alice.stream.pull();
    await settle();
    expect(alice.text()).toBe("Draft one two");
    expect(bob.stream.hasPending()).toBe(false);
  });

  it("keeps sessions converging when the page is materialized between their batches", async () => {
    const authority = new JournalAuthority("body", paragraph("abc"));
    const schema = pageBodySchema();
    const alice = new Client(authority, schema, "alice-session");
    const bob = new Client(authority, schema, "bob-session");

    alice.edit((tr) => tr.insertText("1", 2));
    await settle();
    authority.materialize();
    bob.edit((tr) => tr.insertText("2", 4));
    await settle();
    await bob.stream.pull();
    await settle();
    alice.edit((tr) => tr.insertText("3", 1));
    await settle();
    await alice.stream.pull();
    await bob.stream.pull();
    await settle();
    authority.materialize();

    expect(alice.text()).toBe(bob.text());
    expect(PMNode.fromJSON(schema, authority.stored).textContent).toBe(alice.text());
    expect(authority.storedRevision).toBe(authority.head);
  });
});

describe("CollabStream — request pacing", () => {
  it("never sends two batches of one session less than the minimum interval apart", async () => {
    const authority = new Authority("title", "Pace");
    const sentAt: number[] = [];
    const inner = authority.transport();
    const timed: CollabTransport = {
      steps: inner.steps,
      submit: (submission) => {
        sentAt.push(Date.now());
        return inner.submit(submission);
      },
    };
    const state = { doc: titleDocFromText("Pace") };
    const stream = new CollabStream({
      field: "title",
      clientId: "pace-session",
      revision: 0,
      transport: timed,
      schema: () => pageTitleSchema,
      docFromSnapshot: (next) => titleDocFromText(next.title.text),
      toJSON: (node) => node.textContent,
      fromJSON: (_schema, json) => titleDocFromText(String(json)),
      merge: (_base, mine) => ({ doc: mine }),
      sendDelayMs: 50,
      minSendIntervalMs: 250,
    });
    let editor = EditorState.create({ doc: state.doc, plugins: [collabPlugin(0, "pace-session")] });
    stream.attach({ getState: () => editor, dispatch: (tr) => { editor = editor.apply(tr); } });
    // A keystroke every 20 ms for two seconds.
    for (let i = 0; i < 100; i += 1) {
      editor = editor.apply(editor.tr.insertText("x", editor.doc.content.size));
      stream.noteLocalChange();
      await vi.advanceTimersByTimeAsync(20);
    }
    await vi.advanceTimersByTimeAsync(1_000);
    const gaps = sentAt.slice(1).map((at, i) => at - sentAt[i]);
    expect(sentAt.length).toBeLessThanOrEqual(10);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(250);
    expect(authority.doc).toBe(`Pace${"x".repeat(100)}`);
    stream.close();
  });
});

describe("CollabStream — titles and carets", () => {
  it("merges concurrent title typing", async () => {
    const authority = new Authority("title", "Roadmap");
    const alice = new Client(authority, pageTitleSchema, "alice-session");
    const bob = new Client(authority, pageTitleSchema, "bob-session");

    alice.edit((tr) => tr.insertText("Q3 ", 0));
    bob.edit((tr) => tr.insertText(" draft", 7));
    await settle();
    await alice.stream.pull();
    await bob.stream.pull();

    expect(alice.text()).toBe("Q3 Roadmap draft");
    expect(bob.text()).toBe(alice.text());
    expect(authority.doc).toBe(alice.text());
  });

  it("places a peer's caret published at an older revision", async () => {
    const authority = new Authority("title", "abcdef");
    const alice = new Client(authority, pageTitleSchema, "alice-session");
    const bob = new Client(authority, pageTitleSchema, "bob-session");

    // Bob publishes a caret after "abc" at revision 0.
    const published = bob.stream.toConfirmed(3)!;
    expect(published).toEqual({ revision: 0, pos: 3 });

    alice.edit((tr) => tr.insertText("XY", 0));
    await settle();
    // Alice is now at revision 1 and still places Bob's caret after "abc".
    expect(alice.stream.fromConfirmed(published.pos, published.revision)).toBe(5);

    // A pending local insertion before the caret shifts it on Alice's screen only.
    alice.edit((tr) => tr.insertText("Z", 0));
    expect(alice.stream.fromConfirmed(published.pos, published.revision)).toBe(6);
    // And Alice's own caret is published without her pending step.
    alice.state = alice.state.apply(alice.state.tr.setSelection(TextSelection.create(alice.state.doc, 6)));
    expect(alice.stream.toConfirmed(6)).toEqual({ revision: 1, pos: 5 });
  });

  it("refuses to place a caret from a revision it has not reached", async () => {
    const authority = new Authority("title", "abc");
    const alice = new Client(authority, pageTitleSchema, "alice-session");
    expect(alice.stream.fromConfirmed(1, 5)).toBeNull();
  });
});

describe("assembleCollabSteps", () => {
  const row = (base: number, count: number, clientId = "c") => ({
    base,
    stepCount: count,
    clientId,
    steps: Array.from({ length: count }, (_, i) => ({ i: base + i })),
  });

  it("returns a contiguous page with one client ID per step", () => {
    const page = assembleCollabSteps("body", 2, 5, [row(0, 2), row(2, 1, "a"), row(3, 2, "b")]);
    expect(page).toMatchObject({ from: 2, to: 5, head: 5, clientIds: ["a", "b", "b"] });
  });

  it("reports a gap when the first batch does not start at the client's revision", () => {
    expect(assembleCollabSteps("body", 1, 5, [row(2, 3)])).toEqual({ gap: true });
  });

  it("reports a gap when a writer advanced the head without journaling", () => {
    expect(assembleCollabSteps("body", 0, 3, [])).toEqual({ gap: true });
  });

  it("stops at the page size and lets the client ask again", () => {
    const page = assembleCollabSteps("body", 0, 6, [row(0, 3), row(3, 3)], 4);
    expect(page).toMatchObject({ to: 3, head: 6 });
  });
});

describe("step JSON across the wire", () => {
  it("rejects steps that do not match the schema", () => {
    const result = applyCollabSteps("body", paragraph("x"), [{ stepType: "replace", from: 0, to: 0, slice: { content: [{ type: "nope" }] } }]);
    expect(result).toEqual({ ok: false, reason: "invalid-step" });
  });

  it("rejects steps that break the document's structure", () => {
    const schema = pageBodySchema();
    const doc = PMNode.fromJSON(schema, paragraph("x"));
    const emptyAll = Step.fromJSON(schema, { stepType: "replace", from: 0, to: doc.content.size });
    const result = applyCollabSteps("body", doc.toJSON(), [emptyAll.toJSON()]);
    // ProseMirror refuses it while replacing; either way nothing is accepted.
    expect(result.ok).toBe(false);
  });
});
