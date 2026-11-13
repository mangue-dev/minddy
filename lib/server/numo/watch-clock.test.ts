import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoWatchItem } from "@/lib/numo-watches";
import type { ClockWatch } from "./watches";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const ISSUE = "44444444-4444-4444-8444-444444444444";
const OBJECTIVE = "55555555-5555-4555-8555-555555555555";
const CONVERSATION = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-11-08T12:00:00.000Z");

type Row = Record<string, unknown>;

/** The records the clock reads, and the watches it fires. */
const world = vi.hoisted(() => ({
  issues: [] as Row[],
  objectives: [] as Row[],
  comments: [] as Row[],
  watches: [] as Row[],
  conversations: [] as Row[],
  turns: [] as Row[],
  access: true,
  locale: "en",
  noteResult: { ok: true, delivered: true } as Record<string, unknown>,
  accessThrowsFor: null as string | null,
}));

/** A query over one in-memory list, with the filters the clock sends. */
function query(rows: () => Row[]) {
  const filters: Array<(row: Row) => boolean> = [];
  let inserted: Row | null = null;
  let removing = false;
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: (row: Row) => { inserted = row; return chain; },
    delete: () => { removing = true; return chain; },
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
    is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return chain; },
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: rows().filter((row) => filters.every((f) => f(row)))[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => void) => {
      if (inserted) { rows().push(inserted); return resolve({ error: null }); }
      const hit = rows().filter((row) => filters.every((f) => f(row)));
      if (removing) for (const row of hit) rows().splice(rows().indexOf(row), 1);
      resolve({ data: hit, error: null });
    },
  };
  return chain;
}

vi.mock("@/lib/server/issue-store", () => ({ issueStore: () => query(() => world.issues) }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => query(() => world.objectives) }));
vi.mock("@/lib/server/comment-store", () => ({ commentStore: () => query(() => world.comments) }));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async (userId: string) => {
    if (world.accessThrowsFor === userId) throw new Error("decode failed");
    return world.access ? { role: "member" } : null;
  },
}));
vi.mock("./conversation-title-content", () => ({
  shouldProtectConversationTitle: async () => false,
  encodeConversationTitle: async (_user: string, _id: string, title: string) => title,
}));

const service = {
  from: (table: string) => query(() =>
    table === "projects" ? [{ id: PROJECT, key: "MIN" }]
      : table === "conversations" ? world.conversations
      : table === "numo_assistant_turns" ? world.turns : []),
  auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { locale: world.locale } } }, error: null }) } },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

// The repository, over the same in-memory watches: the claim is the real
// conditional transition, so double processing is visible.
vi.mock("./watches", () => ({
  expireNumoWatches: async () => 0,
  listClockWatches: async (_service: unknown, afterId: string | null) => world.watches
    .filter((watch) => watch.status === "active" && (!afterId || (watch.id as string) > afterId))
    .sort((a, b) => (a.id as string).localeCompare(b.id as string))
    .map((watch) => ({ ...watch })),
  claimNumoWatch: async (_service: unknown, watch: { id: string }) => {
    await Promise.resolve();
    const row = world.watches.find((candidate) => candidate.id === watch.id && candidate.status === "active");
    if (!row) return null;
    row.status = "fired";
    return { ...row };
  },
  // A recurring watch moves to its next occurrence in the claim itself.
  advanceRecurringNumoWatch: async (_service: unknown, watch: { id: string; fire_at: string },
    options: { fire: boolean; now: Date }) => {
    await Promise.resolve();
    const row = world.watches.find((candidate) => candidate.id === watch.id &&
      candidate.status === "active" && candidate.fire_at === watch.fire_at);
    if (!row) return null;
    row.fire_at = new Date(Date.parse(watch.fire_at) + 24 * 60 * 60 * 1000).toISOString();
    if (options.fire) Object.assign(row, { fired_at: options.now.toISOString(), outcome: null, conversation_id: null });
    return { ...row };
  },
  recordNumoWatchOccurrence: async (_service: unknown, occurrence: { id: string; firedAt: string },
    result: { outcome?: string; conversationId?: string; failed?: boolean; finished?: boolean }) => {
    const row = world.watches.find((candidate) => candidate.id === occurrence.id && candidate.fired_at === occurrence.firedAt);
    if (!row) return { paused: false };
    if (result.outcome) row.outcome = result.outcome;
    if (result.conversationId) row.conversation_id = result.conversationId;
    if (result.finished) row.consecutive_failures = 0;
    if (!result.failed) return { paused: false };
    row.consecutive_failures = ((row.consecutive_failures as number | undefined) ?? 0) + 1;
    if ((row.consecutive_failures as number) < 3 || row.status !== "active") return { paused: false };
    row.status = "paused";
    return { paused: true };
  },
  numoWatchOccurrenceRequestId: (id: string, firedAt: string) => `${id}@${firedAt}`,
  claimStrandedNumoWatches: async () => {
    const stranded = world.watches.filter((watch) => (watch.status === "fired" || watch.status === "active") &&
      watch.outcome === null && watch.stranded);
    for (const row of stranded) row.outcome = "failed";
    return stranded.map((row) => ({ ...row }));
  },
  getNumoWatch: async (_service: unknown, _user: string, id: string) =>
    world.watches.find((watch) => watch.id === id) ?? null,
  recentActedNumoWatchRequestIds: async () => [],
  recordNumoWatchOutcome: async (_service: unknown, id: string, outcome: string) => {
    const row = world.watches.find((candidate) => candidate.id === id);
    if (row) row.outcome = outcome;
  },
  cancelClockWatches: async (_service: unknown, ids: string[]) => {
    for (const row of world.watches) if (ids.includes(row.id as string) && row.status === "active") row.status = "canceled";
  },
}));

const notes = vi.hoisted(() => [] as Array<{
  title: string; body: string; link: unknown; dedupe?: boolean; projectId?: string | null;
}>);
vi.mock("@/lib/server/numo-notes", () => ({
  NUMO_NOTE_BODY_MAX: 600,
  sendNumoNote: async (input: {
    title: string; body: string; link: unknown; dedupe?: boolean; projectId: string | null;
  }) => {
    notes.push({
      title: input.title, body: input.body, link: input.link, dedupe: input.dedupe, projectId: input.projectId,
    });
    return world.noteResult;
  },
}));

// The only stub of the firing path: the turn launcher.
const startNumoIntent = vi.hoisted(() => vi.fn());
vi.mock("./start-intent", () => ({
  startNumoIntent,
  NumoIntentStartError: class NumoIntentStartError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));

import {
  dispatchNumoWatch,
  evaluateWatch,
  notifyReminderOfNumoTurn,
  runNumoWatchClock,
  type WatchTargetState,
} from "./watch-clock";
import type { NumoTurn } from "./turns";

function clockWatch(overrides: Partial<ClockWatch> = {}): ClockWatch {
  return {
    id: "w1", user_id: ALICE, project_id: PROJECT, target_type: "issue", target_id: ISSUE,
    condition: { kind: "status", status: "done" }, fire_at: null,
    expires_at: "2027-02-06T12:00:00.000Z", recurrence: null, timezone: "Europe/Paris",
    created_at: "2026-11-08T10:00:00.000Z", ...overrides,
  };
}

function watchItem(overrides: Partial<NumoWatchItem> = {}): NumoWatchItem {
  return {
    ...clockWatch(), action: "notify", instruction: "Tell the client", conversation_id: CONVERSATION,
    timezone: "Europe/Paris", status: "fired", fired_at: NOW.toISOString(), outcome: null,
    grants: [], consecutive_failures: 0, ...overrides,
  } as NumoWatchItem;
}

function state(partial: Partial<WatchTargetState> = {}): WatchTargetState {
  return { issues: new Map(), objectives: new Map(), comments: new Map(), ...partial };
}

beforeEach(() => {
  world.issues = [];
  world.objectives = [];
  world.comments = [];
  world.watches = [];
  world.conversations = [];
  world.turns = [];
  world.access = true;
  world.locale = "en";
  world.noteResult = { ok: true, delivered: true };
  world.accessThrowsFor = null;
  notes.length = 0;
  startNumoIntent.mockReset();
  startNumoIntent.mockResolvedValue({ conversationId: CONVERSATION, turnId: "t1" });
});

describe("evaluateWatch", () => {
  const issue = (status: string, extra: { project?: string; trashed?: boolean } = {}) =>
    state({ issues: new Map([[ISSUE, {
      project_id: extra.project ?? PROJECT, status, number: 42, trashed: extra.trashed ?? false,
    }]]) });

  it("fires when the issue reaches the status, and waits before", () => {
    expect(evaluateWatch(clockWatch(), issue("done"), NOW)).toBe("fire");
    expect(evaluateWatch(clockWatch(), issue("in_review"), NOW)).toBe("wait");
  });

  it("waits while the issue is in the trash, and reads a deleted or moved issue as gone", () => {
    expect(evaluateWatch(clockWatch(), issue("done", { trashed: true }), NOW)).toBe("wait");
    expect(evaluateWatch(clockWatch(), state(), NOW)).toBe("gone");
    expect(evaluateWatch(clockWatch(), issue("done", { project: "other-project" }), NOW)).toBe("gone");
  });

  it("fires on someone else's comment written after the watch, a forge comment included", () => {
    const watch = clockWatch({ condition: { kind: "comment" } });
    const comments = (author: string | null, at: string) => ({
      ...issue("todo"), comments: new Map([[ISSUE, [{ author_id: author, created_at: at }]]]),
    });
    expect(evaluateWatch(watch, comments(BOB, "2026-11-08T11:00:00Z"), NOW)).toBe("fire");
    expect(evaluateWatch(watch, comments(null, "2026-11-08T11:00:00Z"), NOW)).toBe("fire");
    expect(evaluateWatch(watch, comments(ALICE, "2026-11-08T11:00:00Z"), NOW)).toBe("wait");
    expect(evaluateWatch(watch, comments(BOB, "2026-11-08T09:00:00Z"), NOW)).toBe("wait");
  });

  it("fires on an objective's status", () => {
    const watch = clockWatch({ target_type: "objective", target_id: OBJECTIVE });
    const objectives = (status: string) =>
      state({ objectives: new Map([[OBJECTIVE, { project_id: PROJECT, status, trashed: false }]]) });
    expect(evaluateWatch(watch, objectives("done"), NOW)).toBe("fire");
    expect(evaluateWatch(watch, objectives("in_progress"), NOW)).toBe("wait");
  });

  it("fires a date watch once its time has come", () => {
    const watch = (at: string) => clockWatch({ target_type: "date", target_id: null, condition: { kind: "date" }, fire_at: at });
    expect(evaluateWatch(watch("2026-11-08T11:59:00Z"), state(), NOW)).toBe("fire");
    expect(evaluateWatch(watch("2026-11-08T12:01:00Z"), state(), NOW)).toBe("wait");
  });
});

describe("runNumoWatchClock", () => {
  const seed = (overrides: Row = {}) => {
    world.issues = [{ id: ISSUE, project_id: PROJECT, status: "done", number: 42, deleted_at: null }];
    world.watches = [{ ...watchItem(), status: "active", ...overrides }];
  };

  it("fires a watch once under double processing", async () => {
    seed();
    const dispatch = vi.fn(async () => "notified" as const);
    const [first, second] = await Promise.all([
      runNumoWatchClock({ now: NOW, dispatch }),
      runNumoWatchClock({ now: NOW, dispatch }),
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(first.fired + second.fired).toBe(1);
    expect(world.watches[0]).toMatchObject({ status: "fired", outcome: "notified" });
  });

  it("leaves a watch whose condition does not hold, or whose issue is in the trash", async () => {
    seed();
    world.issues[0].status = "in_progress";
    const dispatch = vi.fn();
    await runNumoWatchClock({ now: NOW, dispatch });
    world.issues[0] = { ...world.issues[0], status: "done", deleted_at: "2026-11-08T11:00:00Z" };
    await runNumoWatchClock({ now: NOW, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(world.watches[0].status).toBe("active");
  });

  it("cancels a watch once its user lost access, even before its condition holds", async () => {
    seed();
    world.issues[0].status = "todo";
    world.access = false;
    const dispatch = vi.fn();
    expect(await runNumoWatchClock({ now: NOW, dispatch })).toMatchObject({ canceled: 1, fired: 0 });
    expect(world.watches[0].status).toBe("canceled");
  });

  it("cancels a watch whose issue no longer exists", async () => {
    seed();
    world.issues = [];
    await runNumoWatchClock({ now: NOW, dispatch: vi.fn() });
    expect(world.watches[0].status).toBe("canceled");
  });

  it("keeps going past a watch that throws", async () => {
    world.issues = [{ id: ISSUE, project_id: PROJECT, status: "done", number: 42, deleted_at: null }];
    world.watches = [
      { ...watchItem({ id: "w1", user_id: BOB }), status: "active" },
      { ...watchItem({ id: "w2" }), status: "active" },
    ];
    world.accessThrowsFor = BOB;
    const dispatch = vi.fn(async () => "notified" as const);
    await runNumoWatchClock({ now: NOW, dispatch });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(world.watches.map((watch) => watch.status)).toEqual(["active", "fired"]);
  });

  it("records a failed dispatch without firing again", async () => {
    seed();
    const dispatch = vi.fn(async () => { throw new Error("boom"); });
    await runNumoWatchClock({ now: NOW, dispatch });
    await runNumoWatchClock({ now: NOW, dispatch });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(world.watches[0]).toMatchObject({ status: "fired", outcome: "failed" });
  });

  it("retries once a watch a dead clock claimed without sending it", async () => {
    world.watches = [{ ...watchItem(), status: "fired", outcome: null, stranded: true }];
    const dispatch = vi.fn(async () => "notified" as const);
    expect(await runNumoWatchClock({ now: NOW, dispatch })).toMatchObject({ retried: 1 });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: "w1" }), { retry: true });
    expect(world.watches[0].outcome).toBe("notified");
  });

  it("stops at its deadline", async () => {
    seed();
    const dispatch = vi.fn();
    await runNumoWatchClock({ now: NOW, dispatch, deadline: Date.now() - 1 });
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("dispatchNumoWatch", () => {
  beforeEach(() => {
    world.issues = [{ id: ISSUE, project_id: PROJECT, status: "done", number: 42 }];
  });

  it("notify: one note with the instruction, linked to the issue, never deduplicated, and no turn", async () => {
    expect(await dispatchNumoWatch(watchItem(), service as never)).toBe("notified");
    expect(startNumoIntent).not.toHaveBeenCalled();
    expect(notes).toEqual([{
      title: "[@](mention:issue/44444444-4444-4444-8444-444444444444) is now “Done”", body: "Tell the client", link: { type: "issue", id: ISSUE }, dedupe: false,
      projectId: PROJECT,
    }]);
  });

  it("records a muted note as muted, and keeps the duplicate check on a retry", async () => {
    world.noteResult = { ok: true, delivered: false, reason: "muted" };
    expect(await dispatchNumoWatch(watchItem(), service as never)).toBe("muted");
    world.noteResult = { ok: true, delivered: false, reason: "duplicate" };
    expect(await dispatchNumoWatch(watchItem(), service as never, { retry: true })).toBe("notified");
    expect(notes[1].dedupe).toBe(true);
  });

  it("writes the note in the user's language", async () => {
    world.locale = "fr";
    await dispatchNumoWatch(watchItem(), service as never);
    // The note names its issue as a mention, which the inbox draws (MIN-975).
    expect(notes[0].title).toBe("[@](mention:issue/44444444-4444-4444-8444-444444444444) est passé à « Terminé »");
  });

  it("act: an unattended reminder turn in the watch's conversation, then a note", async () => {
    world.locale = "fr";
    expect(await dispatchNumoWatch(watchItem({ action: "act" }), service as never)).toBe("acted");
    expect(startNumoIntent).toHaveBeenCalledTimes(1);
    const input = startNumoIntent.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: ALICE, projectId: PROJECT, conversationId: CONVERSATION, requestId: "w1",
      source: "reminder", executeInBackground: false, timezone: "Europe/Paris",
      reminder: { watchId: "w1", projectId: PROJECT, targetType: "issue", targetId: ISSUE },
    });
    // The message is the user's own words back, in their language.
    expect(input.prompt).toBe("Rappel : MIN-42 est passé à « Terminé »\nConsigne : Tell the client");
    expect(notes[0].body).toBe("Numo s'en occupe : Tell the client");
  });

  it("act: opens a conversation of its own, titled with what happened, when the original one is busy", async () => {
    startNumoIntent.mockRejectedValueOnce(new Error("conversation_busy"));
    expect(await dispatchNumoWatch(watchItem({ action: "act" }), service as never)).toBe("acted");
    expect(startNumoIntent).toHaveBeenCalledTimes(2);
    const second = startNumoIntent.mock.calls[1][0];
    expect(second.conversationId).not.toBe(CONVERSATION);
    expect(world.conversations).toEqual([expect.objectContaining({
      id: second.conversationId, user_id: ALICE, title: "MIN-42 is now “Done”",
    })]);
  });

  it("act without budget falls back to a note that says so", async () => {
    startNumoIntent.mockRejectedValueOnce(Object.assign(new Error("Plan limit"), { code: "usage_budget_exceeded" }));
    expect(await dispatchNumoWatch(watchItem({ action: "act" }), service as never)).toBe("budget_fallback");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("usage limit");
    expect(notes[0].body).toContain("Tell the client");
  });
});

describe("notifyReminderOfNumoTurn", () => {
  const turn = (status: string) => ({
    id: "t1", user_id: ALICE, status,
    intent: { reminder: { watchId: "w1", projectId: PROJECT, targetType: "issue", targetId: ISSUE } },
  }) as unknown as NumoTurn;

  it("tells the user when the reminder's turn failed, and records it", async () => {
    world.issues = [{ id: ISSUE, project_id: PROJECT, status: "done", number: 42 }];
    world.watches = [{ ...watchItem({ action: "act", outcome: "acted" }) }];
    notifyReminderOfNumoTurn(turn("failed"));
    await vi.waitFor(() => expect(notes).toHaveLength(1));
    expect(notes[0].body).toContain("could not carry it out");
    expect(world.watches[0].outcome).toBe("failed");
  });

  it("says nothing when the turn completed", async () => {
    world.watches = [{ ...watchItem({ action: "act", outcome: "acted" }) }];
    notifyReminderOfNumoTurn(turn("completed"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notes).toEqual([]);
  });
});

describe("recurring reminders (MIN-953)", () => {
  const DUE = "2026-11-08T11:55:00.000Z";
  const NEXT = "2026-11-09T11:55:00.000Z";
  /** Every day at 12:55 in Paris, with two grants; its occurrence is five minutes late. */
  const seed = (overrides: Row = {}) => {
    world.watches = [{
      ...watchItem({
        target_type: "date", target_id: null, condition: { kind: "date" }, action: "act",
        instruction: "Check the model costs", recurrence: { kind: "daily", time: "12:55" },
        grants: ["notification", "administration"], conversation_id: null,
      }),
      status: "active", fire_at: DUE, fired_at: null, ...overrides,
    }];
  };

  it("claims the occurrence and moves the reminder on before the turn is admitted", async () => {
    seed();
    let duringAdmission: Row | null = null;
    startNumoIntent.mockImplementation(async () => {
      duringAdmission = { ...world.watches[0] };
      return { conversationId: "c", turnId: "t1" };
    });
    expect(await runNumoWatchClock({ now: NOW })).toMatchObject({ fired: 1, skipped: 0 });
    // A clock that dies in the turn's admission has already scheduled tomorrow.
    expect(duringAdmission).toMatchObject({ status: "active", fire_at: NEXT, fired_at: NOW.toISOString() });
    const input = startNumoIntent.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: ALICE, projectId: PROJECT, source: "reminder", executeInBackground: false,
      requestId: `w1@${NOW.toISOString()}`,
      reminder: {
        watchId: "w1", targetType: "date",
        recurring: { firedAt: NOW.toISOString(), grants: ["notification", "administration"] },
      },
    });
    expect(input.prompt).toBe("Recurring reminder\nInstruction: Check the model costs");
    // A conversation of its own, titled with the reminder and the day.
    expect(world.conversations).toEqual([expect.objectContaining({
      id: input.conversationId, user_id: ALICE, title: "Check the model costs · Nov 8, 2026",
    })]);
    expect(world.watches[0]).toMatchObject({
      status: "active", outcome: "acted", conversation_id: input.conversationId, consecutive_failures: 0,
    });
    // No "on it" note for something that comes back every day.
    expect(notes).toEqual([]);
    // The same tick again finds nothing due.
    expect(await runNumoWatchClock({ now: NOW })).toMatchObject({ fired: 0 });
    expect(startNumoIntent).toHaveBeenCalledTimes(1);
  });

  it("fires an occurrence once under double processing", async () => {
    seed();
    const dispatch = vi.fn(async () => "acted" as const);
    const [first, second] = await Promise.all([
      runNumoWatchClock({ now: NOW, dispatch }),
      runNumoWatchClock({ now: NOW, dispatch }),
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(first.fired + second.fired).toBe(1);
  });

  it("skips an occurrence missed by more than the grace period instead of running it late", async () => {
    seed({ fire_at: "2026-11-08T04:00:00.000Z" });
    const dispatch = vi.fn();
    expect(await runNumoWatchClock({ now: NOW, dispatch })).toMatchObject({ fired: 0, skipped: 1 });
    expect(dispatch).not.toHaveBeenCalled();
    expect(world.watches[0]).toMatchObject({ status: "active", fire_at: "2026-11-09T04:00:00.000Z", fired_at: null });
  });

  it("cancels it once the user lost access to its project", async () => {
    seed();
    world.access = false;
    expect(await runNumoWatchClock({ now: NOW, dispatch: vi.fn() })).toMatchObject({ canceled: 1, fired: 0 });
    expect(world.watches[0].status).toBe("canceled");
  });

  it("tells the user why an occurrence did not start, then pauses the reminder at the third in a row", async () => {
    seed();
    startNumoIntent.mockRejectedValue(Object.assign(new Error("Plan limit"), { code: "usage_budget_exceeded" }));
    for (const day of [8, 9, 10]) {
      await runNumoWatchClock({ now: new Date(`2026-11-${String(day).padStart(2, "0")}T12:00:00.000Z`) });
    }
    expect(startNumoIntent).toHaveBeenCalledTimes(3);
    expect(notes.map((note) => note.body)).toEqual([
      expect.stringContaining("usage limit"),
      expect.stringContaining("usage limit"),
      "Paused: 3 runs in a row did not finish. Resume it in your settings. Your reminder: Check the model costs",
    ]);
    expect(world.watches[0]).toMatchObject({ status: "paused", outcome: "budget_fallback", consecutive_failures: 3 });
    // The conversations opened for turns that never started are removed.
    expect(world.conversations).toEqual([]);
  });

  it("does not start a second turn for an occurrence a dead clock had already admitted", async () => {
    seed({ fire_at: NEXT, fired_at: "2026-11-08T11:40:00.000Z", outcome: null, stranded: true });
    world.turns = [{ request_id: "w1@2026-11-08T11:40:00.000Z", user_id: ALICE, conversation_id: "c-admitted" }];
    expect(await runNumoWatchClock({ now: NOW })).toMatchObject({ retried: 1, fired: 0 });
    expect(startNumoIntent).not.toHaveBeenCalled();
    expect(world.watches[0]).toMatchObject({ outcome: "acted", conversation_id: "c-admitted" });
  });

  describe("when its turn ends", () => {
    const FIRED = NOW.toISOString();
    const turn = (status: string, firedAt = FIRED) => ({
      id: "t1", user_id: ALICE, status,
      intent: { reminder: {
        watchId: "w1", projectId: PROJECT, targetType: "date", targetId: null,
        recurring: { firedAt, grants: [] },
      } },
    }) as unknown as NumoTurn;

    it("a turn that finished clears the failures and says nothing", async () => {
      seed({ fire_at: NEXT, fired_at: FIRED, outcome: "acted", consecutive_failures: 2 });
      notifyReminderOfNumoTurn(turn("completed"));
      await vi.waitFor(() => expect(world.watches[0].consecutive_failures).toBe(0));
      expect(world.watches[0].outcome).toBe("acted");
      expect(notes).toEqual([]);
    });

    it("a turn that failed is counted and told, and the third pauses the reminder", async () => {
      seed({ fire_at: NEXT, fired_at: FIRED, outcome: "acted", consecutive_failures: 1 });
      notifyReminderOfNumoTurn(turn("failed"));
      await vi.waitFor(() => expect(notes).toHaveLength(1));
      expect(notes[0].body).toContain("could not carry it out");
      expect(world.watches[0]).toMatchObject({ status: "active", outcome: "failed", consecutive_failures: 2 });
      notifyReminderOfNumoTurn(turn("stopped"));
      await vi.waitFor(() => expect(notes).toHaveLength(2));
      expect(notes[1].body).toContain("Paused: 3 runs in a row");
      expect(world.watches[0].status).toBe("paused");
    });

    it("leaves a later occurrence alone when an older turn ends", async () => {
      seed({ fire_at: NEXT, fired_at: FIRED, outcome: "acted", consecutive_failures: 0 });
      notifyReminderOfNumoTurn(turn("failed", "2026-11-07T12:00:00.000Z"));
      await vi.waitFor(() => expect(notes).toHaveLength(1));
      expect(world.watches[0]).toMatchObject({ outcome: "acted", consecutive_failures: 0 });
    });
  });
});

describe("personal reminders (MIN-982)", () => {
  /** Every day at 09:00 in Paris, in no project; its occurrence is five minutes late. */
  const DUE = "2026-11-08T07:55:00.000Z";
  const AT_NINE = new Date("2026-11-08T08:00:00.000Z");
  const seed = (overrides: Row = {}) => {
    world.watches = [{
      ...watchItem({
        project_id: null, target_type: "date", target_id: null, condition: { kind: "date" }, action: "act",
        instruction: "Check the web for a concert by X", recurrence: { kind: "daily", time: "09:00" },
        grants: ["notification"], conversation_id: null,
      }),
      status: "active", fire_at: DUE, fired_at: null, ...overrides,
    }];
  };

  it("runs its occurrence with no project, whatever the user's project access", async () => {
    seed();
    // No project to open: the reminder still belongs to its user.
    world.access = false;
    expect(await runNumoWatchClock({ now: AT_NINE })).toMatchObject({ fired: 1, canceled: 0 });
    const input = startNumoIntent.mock.calls[0][0];
    expect(input).toMatchObject({
      userId: ALICE, projectId: null, source: "reminder", timezone: "Europe/Paris",
      reminder: {
        watchId: "w1", projectId: null, targetType: "date",
        recurring: { firedAt: AT_NINE.toISOString(), grants: ["notification"] },
      },
    });
    expect(world.watches[0]).toMatchObject({ status: "active", outcome: "acted", fire_at: "2026-11-09T07:55:00.000Z" });
    expect(notes).toEqual([]);
  });

  it("tells the user about a failed occurrence with a personal note", async () => {
    seed();
    startNumoIntent.mockRejectedValue(new Error("boom"));
    await runNumoWatchClock({ now: AT_NINE });
    expect(notes).toEqual([expect.objectContaining({
      projectId: null, link: null, body: expect.stringContaining("could not carry it out"),
    })]);
  });

  it("a one-off personal reminder sends its note in no project", async () => {
    seed({ action: "notify", recurrence: null, grants: [], instruction: "Call the venue" });
    world.access = false;
    expect(await runNumoWatchClock({ now: AT_NINE })).toMatchObject({ fired: 1 });
    expect(notes).toEqual([expect.objectContaining({ projectId: null, link: null, body: "Call the venue" })]);
    expect(world.watches[0]).toMatchObject({ status: "fired", outcome: "notified" });
  });
});
