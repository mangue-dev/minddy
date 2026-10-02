import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NumoRoutineOccurrence } from "@/lib/server/routine-occurrences";

/**
 * Numo's read access to routine runs (MIN-589). What is pinned here is what a
 * wrong join would silently hide in the thread: the run-state mapping (a
 * paused-for-input occurrence must NOT read as a plain "running"), the
 * reservation error that forces a failed state, the delegated pull request
 * reaching the summary, and the owner-only transcript that comes back empty
 * rather than leaking through a foreign client.
 */

const ROUTINE_ID = "44444444-4444-4444-8444-444444444444";
const CONVERSATION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVERSATION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TURN_A = "55555555-5555-4555-8555-555555555555";
const TURN_B = "66666666-6666-4666-8666-666666666666";

const world = vi.hoisted(() => ({
  /** Rows the fake service client serves, keyed by table name. */
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  /** What the RLS (read) client serves for the transcript queries. */
  messages: [] as Array<Record<string, unknown>>,
  /** Whether the RLS client resolves the conversation identity. */
  identityResolvable: true,
}));

type TableRow = Record<string, unknown>;
function occurrenceRow(overrides: Partial<NumoRoutineOccurrence> = {}): TableRow {
  return occurrence(overrides) as unknown as TableRow;
}

function rowsFor(table: string): Array<Record<string, unknown>> {
  return world.tables[table] ?? [];
}

function chainedQuery(table: string) {
  let rows: Array<Record<string, unknown>> = rowsFor(table);
  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      rows = rows.filter((row) => values.includes(row[column] as string));
      return builder;
    },
    order(column: string) {
      rows = [...rows].sort((left, right) =>
        String(left[column]).localeCompare(String(right[column])),
      );
      return builder;
    },
    then: (
      resolve?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown,
      reject?: (reason?: unknown) => unknown,
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    maybeSingle() {
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
  };
  return builder;
}

function transcriptQuery(table: string) {
  // `numo_conversation_ids` resolves the legacy conversation → numo id; the
  // RLS client resolves it only for the owner's conversation (conversation A).
  if (table === "numo_conversation_ids") {
    return {
      select: () => ({
        eq: (_column: string, value: unknown) => ({
          maybeSingle: () =>
            Promise.resolve(
              world.identityResolvable && value === CONVERSATION_A
                ? { data: { id: CONVERSATION_A }, error: null }
                : { data: null, error: null },
            ),
        }),
      }),
    };
  }
  // `numo_messages` is awaited directly, so the builder is thenable.
  let rows = world.messages;
  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    neq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] !== value);
      return builder;
    },
    order() {
      return builder;
    },
    then: (
      resolve?: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown,
      reject?: (reason?: unknown) => unknown,
    ) =>
      Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return builder;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => chainedQuery(table),
  }),
}));

vi.mock("@/lib/server/routine-occurrences", () => ({
  occurrencesForRoutine: (routineId: string, limit: number) =>
    Promise.resolve(
      (world.tables["numo_routine_occurrences"] ?? []).slice(0, limit),
    ),
}));

const readClient = {
  from: (table: string) => transcriptQuery(table),
} as never;

function occurrence(overrides: Partial<NumoRoutineOccurrence> = {}): NumoRoutineOccurrence {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    routine_id: ROUTINE_ID,
    origin: "scheduled",
    scheduled_for: "2026-09-21T09:00:00Z",
    conversation_id: CONVERSATION_A,
    request_id: "request-a",
    turn_id: TURN_A,
    error_code: null,
    error_message: null,
    created_at: "2026-09-21T09:00:01Z",
    updated_at: "2026-09-21T09:05:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  world.tables = {};
  world.identityResolvable = true;
});

describe("Numo routine run reads", () => {
  it("maps the durable turn state onto a run status", async () => {
    const { routineRunStatus } = await import("./routine-runs");

    expect(routineRunStatus(null)).toBe("queued");
    expect(routineRunStatus("queued")).toBe("running");
    expect(routineRunStatus("running")).toBe("running");
    expect(routineRunStatus("waiting_work")).toBe("running");
    expect(routineRunStatus("waiting_input")).toBe("running");
    expect(routineRunStatus("completed")).toBe("completed");
    expect(routineRunStatus("failed")).toBe("failed");
    expect(routineRunStatus("stopped")).toBe("canceled");
  });

  it("summarizes runs with state, outcome and the delegated pull request", async () => {
    world.tables["numo_routine_occurrences"] = [
      occurrenceRow({
        id: "88888888-8888-4888-8888-888888888888",
        conversation_id: CONVERSATION_A,
        turn_id: TURN_A,
      }),
      occurrenceRow({
        id: "99999999-9999-4999-8999-999999999999",
        conversation_id: CONVERSATION_B,
        turn_id: TURN_B,
        scheduled_for: null,
        origin: "manual",
        created_at: "2026-09-22T10:00:00Z",
      }),
    ];
    world.tables["numo_assistant_turns"] = [
      {
        id: TURN_A,
        conversation_id: CONVERSATION_A,
        status: "waiting_input",
        outcome: null,
        error_message: null,
        cost_usd: 0.42,
        started_at: "2026-09-21T09:00:05Z",
        completed_at: null,
      },
      {
        id: TURN_B,
        conversation_id: CONVERSATION_B,
        status: "completed",
        outcome: "summary",
        error_message: null,
        cost_usd: 0.1,
        started_at: "2026-09-22T10:00:05Z",
        completed_at: "2026-09-22T10:03:00Z",
      },
    ];
    world.tables["agent_runs"] = [
      {
        id: "worker-1",
        parent_numo_turn_id: TURN_B,
        pr_number: 42,
        pr_url: "https://example.com/pull/42",
        pr_state: "open",
      },
    ];

    const { routineRunSummaries } = await import("./routine-runs");
    const runs = await routineRunSummaries({ id: ROUTINE_ID } as never, 20);

    expect(runs).toHaveLength(2);
    // Most recent first, regardless of how the rows arrived: the manual run
    // of September 22 precedes the scheduled one of September 21.
    expect(runs[0].id).toBe("99999999-9999-4999-8999-999999999999");
    const paused = runs[1];
    expect(paused.status).toBe("running");
    expect(paused.waiting_input).toBe(true);
    expect(paused.numo_status).toBe("waiting_input");
    expect(paused.cost_usd).toBe(0.42);
    expect(paused.created_at).toBe("2026-09-21T09:00:00Z");
    const finished = runs[0];
    expect(finished.status).toBe("completed");
    expect(finished.waiting_input).toBe(false);
    expect(finished.outcome).toBe("summary");
    expect(finished.pr_number).toBe(42);
    expect(finished.pr_url).toBe("https://example.com/pull/42");
  });

  it("reports a failed reservation even without a turn", async () => {
    world.tables["numo_routine_occurrences"] = [
      occurrenceRow({
        turn_id: null,
        error_code: "numo_unavailable",
        error_message: "Numo could not start this routine occurrence.",
      }),
    ];

    const { routineRunSummaries } = await import("./routine-runs");
    const runs = await routineRunSummaries({ id: ROUTINE_ID } as never, 20);

    expect(runs[0].status).toBe("failed");
    expect(runs[0].numo_status).toBe(null);
    expect(runs[0].error_message).toContain("could not start");
  });

  it("returns the transcript through the caller's RLS client", async () => {
    world.tables["numo_routine_occurrences"] = [occurrenceRow()];
    world.tables["numo_assistant_turns"] = [
      {
        id: TURN_A,
        conversation_id: CONVERSATION_A,
        status: "completed",
        outcome: "done",
        error_message: null,
        cost_usd: 0.2,
        started_at: "2026-09-21T09:00:05Z",
        completed_at: "2026-09-21T09:04:00Z",
      },
    ];
    world.messages = [
      {
        conversation_id: CONVERSATION_A,
        source: "assistant",
        role: "assistant",
        kind: "message",
        content: "I updated the issue priorities.",
        tool_name: null,
        created_at: "2026-09-21T09:01:00Z",
      },
      {
        conversation_id: CONVERSATION_A,
        source: "assistant",
        role: "assistant",
        kind: "action",
        content: "{\"result\":{\"success\":true}}",
        tool_name: "list_issues",
        created_at: "2026-09-21T09:00:40Z",
      },
    ];

    const { routineOccurrenceDetail } = await import("./routine-runs");
    const detail = await routineOccurrenceDetail({
      routine: { id: ROUTINE_ID } as never,
      occurrence: occurrence(),
      readClient,
    });

    expect(detail.occurrence.status).toBe("completed");
    expect(detail.transcript).not.toBeNull();
    expect(detail.transcript?.messages).toHaveLength(1);
    expect(detail.transcript?.messages[0]).toMatchObject({
      role: "assistant",
      content: "I updated the issue priorities.",
    });
    expect(detail.transcript?.actions).toHaveLength(1);
    expect(detail.transcript?.actions[0]).toMatchObject({
      tool_name: "list_issues",
    });
  });

  it("says when the transcript is not readable instead of failing", async () => {
    world.tables["numo_routine_occurrences"] = [occurrenceRow()];
    world.tables["numo_assistant_turns"] = [
      { id: TURN_A, conversation_id: CONVERSATION_A, status: "completed" },
    ];
    world.identityResolvable = false;

    const { routineOccurrenceDetail } = await import("./routine-runs");
    const detail = await routineOccurrenceDetail({
      routine: { id: ROUTINE_ID } as never,
      occurrence: occurrence(),
      readClient,
    });

    expect(detail.transcript).toBeNull();
    expect(detail.transcript_note).toMatch(/not readable/);
  });
});
