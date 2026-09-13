import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getAuthedUser: vi.fn(),
  requestStop: vi.fn(),
  retryTurn: vi.fn(),
  executeTurn: vi.fn(),
  afterSeq: -1,
  activity: [
    { id: "event-1", seq: 0, type: "content_delta", payload: { delta: "First" } },
    { id: "event-2", seq: 1, type: "done", payload: { status: "completed" } },
  ],
  pendingInput: {
    run_id: "51600000-0000-4000-8000-000000000022",
    parent_numo_turn_id: "51600000-0000-4000-8000-000000000021",
    question_id: "question-1",
    call_id: "call-question",
    questions: [{ header: "Source", question: "Which API should be used?", options: [] }],
  },
}));

function queryFor(table: string) {
  const query = {
    select: () => query,
    eq: () => query,
    gt: (_column: string, value: number) => {
      h.afterSeq = value;
      return query;
    },
    order: () => query,
    limit: () => query,
    single: async () => table === "numo_conversation_history"
      ? { data: { id: CONVERSATION_ID, source: "assistant", status: "generating", error_message: null } }
      : { data: null },
    maybeSingle: async () => {
      if (table === "numo_conversation_history") {
        return { data: { id: CONVERSATION_ID, source: "assistant" } };
      }
      if (table === "agent_run_input_requests") return { data: h.pendingInput };
      return {
          data: {
            id: TURN_ID,
            status: "waiting_work",
            error_message: null,
            last_event_seq: 1,
            active_run_id: RUN_ID,
          },
        };
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: table === "numo_turn_events"
        ? h.activity.filter((event) => event.seq > h.afterSeq)
        : [],
    }).then(resolve),
  };
  return query;
}

const supabase = { from: (table: string) => queryFor(table) };
const CONVERSATION_ID = "51600000-0000-4000-8000-000000000020";
const TURN_ID = "51600000-0000-4000-8000-000000000021";
const RUN_ID = "51600000-0000-4000-8000-000000000022";

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => h.getAuthedUser(...args),
}));
vi.mock("@/lib/server/numo/turns", () => ({
  executeNumoTurn: (...args: unknown[]) => h.executeTurn(...args),
  requestNumoTurnStop: (...args: unknown[]) => h.requestStop(...args),
  retryNumoTurn: (...args: unknown[]) => h.retryTurn(...args),
}));
const { GET } = await import("@/app/api/assistant/conversations/[id]/status/route");
const { POST } = await import("@/app/api/assistant/conversations/[id]/turn/route");

beforeEach(() => {
  vi.clearAllMocks();
  h.afterSeq = -1;
  h.getAuthedUser.mockResolvedValue({
    ok: true,
    user: { id: "user-1" },
    supabase,
  });
});

describe("durable Numo turn routes", () => {
  it("replays persisted activity after the caller cursor", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/assistant/conversations/${CONVERSATION_ID}/status?after=0`),
      { params: Promise.resolve({ id: CONVERSATION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "waiting_work",
      turn_id: TURN_ID,
      last_event_seq: 1,
      pending_input: h.pendingInput,
      activity: [{ id: "event-2", seq: 1, type: "done" }],
    });
  });

  it("stops the parent through the atomic orchestration action", async () => {
    h.requestStop.mockResolvedValue({ id: TURN_ID, status: "stopped", active_run_id: RUN_ID });

    const response = await POST(
      new NextRequest(`http://localhost/api/assistant/conversations/${CONVERSATION_ID}/turn`, {
        method: "POST",
        body: JSON.stringify({ action: "stop" }),
      }),
      { params: Promise.resolve({ id: CONVERSATION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(h.requestStop).toHaveBeenCalledWith(CONVERSATION_ID, "user-1");
  });

  it("reclaims an explicit retry with the caller's authorized client", async () => {
    h.retryTurn.mockResolvedValue({ id: TURN_ID, status: "retryable" });
    h.executeTurn.mockResolvedValue({ status: "completed", turn: { id: TURN_ID } });

    const response = await POST(
      new NextRequest(`http://localhost/api/assistant/conversations/${CONVERSATION_ID}/turn`, {
        method: "POST",
        body: JSON.stringify({ action: "retry" }),
      }),
      { params: Promise.resolve({ id: CONVERSATION_ID }) },
    );

    expect(response.status).toBe(200);
    expect(h.executeTurn).toHaveBeenCalledWith({
      turnId: TURN_ID,
      readClient: supabase,
      allowRetryable: true,
    });
  });
});
