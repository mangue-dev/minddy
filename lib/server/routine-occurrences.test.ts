import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    occurrence: null as Record<string, unknown> | null,
    turn: null as Record<string, unknown> | null,
    updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
    start: vi.fn(),
  };
  const from = (table: string) => {
    const query = {
      select: () => query,
      update: (values: Record<string, unknown>) => {
        state.updates.push({ table, values });
        return query;
      },
      eq: () => query,
      is: () => query,
      single: async () => ({
        data: table === "numo_assistant_turns" ? state.turn : state.occurrence,
        error: null,
      }),
      maybeSingle: async () => ({
        data: table === "numo_assistant_turns" ? state.turn : state.occurrence,
        error: null,
      }),
    };
    return query;
  };
  return {
    state,
    service: {
      from,
      rpc: vi.fn(async () => ({ data: state.occurrence, error: null })),
      auth: {
        admin: {
          getUserById: vi.fn(async () => ({
            data: { user: { user_metadata: { locale: "en" } } },
          })),
        },
      },
    },
  };
});

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => h.service as unknown as SupabaseClient,
}));
vi.mock("@/lib/server/numo/start-intent", () => ({
  startNumoIntent: (...args: unknown[]) => h.state.start(...args),
}));
vi.mock("@/lib/server/routines", () => ({
  routineRunBudgetUsd: vi.fn(async () => 1.5),
}));

const { startRoutineOccurrence } = await import("./routine-occurrences");

const routine = {
  id: "11111111-1111-4111-8111-111111111111",
  project_id: "22222222-2222-4222-8222-222222222222",
  owner_id: "33333333-3333-4333-8333-333333333333",
  title: "Weekly triage",
  prompt: "Triage the project and summarize what needs attention.",
  prompt_mentions: [],
  base_branch: null,
  max_spend_percent: 15,
  frequency: "weekly" as const,
  hour: 9,
  minute: 0,
  weekdays: [1],
  days_of_month: [],
  timezone: "Europe/Paris",
  enabled: true,
  next_run_at: "2026-09-14T07:00:00.000Z",
  last_run_at: null,
  last_error: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

beforeEach(() => {
  h.state.updates.length = 0;
  h.state.occurrence = {
    id: "44444444-4444-4444-8444-444444444444",
    routine_id: routine.id,
    origin: "scheduled",
    scheduled_for: routine.next_run_at,
    conversation_id: "55555555-5555-4555-8555-555555555555",
    request_id: "66666666-6666-4666-8666-666666666666",
    turn_id: null,
    error_code: null,
    error_message: null,
    created_at: "2026-09-14T07:00:00.000Z",
    updated_at: "2026-09-14T07:00:00.000Z",
  };
  h.state.turn = {
    id: "77777777-7777-4777-8777-777777777777",
    conversation_id: h.state.occurrence.conversation_id,
  };
  h.state.start.mockReset().mockResolvedValue({
    conversationId: h.state.occurrence.conversation_id,
    turnId: h.state.turn.id,
  });
});

describe("startRoutineOccurrence", () => {
  it("admits scheduled work through the canonical Numo entry without repository settings", async () => {
    const result = await startRoutineOccurrence({
      routine,
      origin: "scheduled",
      scheduledFor: routine.next_run_at,
    });

    expect(h.state.start).toHaveBeenCalledWith(expect.objectContaining({
      userId: routine.owner_id,
      projectId: routine.project_id,
      source: "routine",
      prompt: routine.prompt,
      conversationId: h.state.occurrence!.conversation_id,
      requestId: h.state.occurrence!.request_id,
      executeInBackground: false,
      routine: {
        id: routine.id,
        origin: "scheduled",
        scheduledFor: routine.next_run_at,
        budgetUsd: 1.5,
        budgetPercent: 15,
      },
    }));
    expect(result.turn.id).toBe(h.state.turn!.id);
    expect(h.state.updates).toContainEqual({
      table: "numo_routine_occurrences",
      values: {
        turn_id: h.state.turn!.id,
        error_code: null,
        error_message: null,
      },
    });
  });

  it("surfaces admission failures on both the occurrence and conversation", async () => {
    const error = Object.assign(new Error("usage_budget_exceeded"), {
      code: "usage_budget_exceeded",
    });
    h.state.start.mockRejectedValueOnce(error);

    await expect(startRoutineOccurrence({ routine, origin: "manual" }))
      .rejects.toBe(error);

    expect(h.state.updates).toContainEqual({
      table: "numo_routine_occurrences",
      values: {
        error_code: "usage_budget_exceeded",
        error_message: "usage_budget_exceeded",
      },
    });
    expect(h.state.updates).toContainEqual({
      table: "conversations",
      values: {
        status: "error",
        error_message: "usage_budget_exceeded",
      },
    });
  });
});
