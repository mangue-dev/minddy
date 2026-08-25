import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  returnedRun: null as Record<string, unknown> | null,
  analytics: [] as Array<Record<string, unknown>>,
  chainEnds: [] as string[],
  routineNotifications: [] as string[],
  routineStamps: [] as string[],
  notifications: [] as Array<Record<string, unknown>>,
  background: [] as Array<Promise<void>>,
}));

const query = {
  update: () => query,
  eq: () => query,
  in: () => query,
  select: () => query,
  maybeSingle: async () => ({ data: h.returnedRun, error: null }),
};
const service = { from: () => query } as unknown as SupabaseClient;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: vi.fn(async (_service: unknown, rows: Array<Record<string, unknown>>) => {
    h.notifications.push(...rows);
  }),
}));
vi.mock("@/lib/server/posthog", () => ({
  captureServerEvent: vi.fn((event: Record<string, unknown>) => h.analytics.push(event)),
}));
vi.mock("@/lib/server/automations/hooks", () => ({
  notifyChainOfRunEnd: vi.fn((run: { id: string }) => h.chainEnds.push(run.id)),
}));
vi.mock("@/lib/server/routine-hooks", () => ({
  notifyRoutineOfRunEnd: vi.fn(async (run: { id: string }) => {
    h.routineNotifications.push(run.id);
  }),
  stampRoutineRunEnd: vi.fn(async (run: { id: string }) => {
    h.routineStamps.push(run.id);
  }),
}));
vi.mock("@/lib/server/after-safe", () => ({
  afterOrNow: vi.fn((work: () => void | Promise<void>) => {
    h.background.push(Promise.resolve(work()));
  }),
}));
vi.mock("./live", () => ({ broadcastRunEvent: vi.fn() }));

const { notifyAgentRun, stampRunResult } = await import("./runs");

const terminalRun = {
  id: "run-1",
  status: "completed",
  created_by: "user-1",
  created_at: "2026-08-25T12:00:00.000Z",
  project_id: "project-1",
  issue_id: null,
  conversation_id: "conversation-1",
  routine_id: "routine-1",
  chain_id: null,
  model: "model-1",
  key_mode: "platform",
  triggered_by: "routine",
  pr_number: null,
};

beforeEach(() => {
  h.returnedRun = { ...terminalRun };
  h.analytics.length = 0;
  h.chainEnds.length = 0;
  h.routineNotifications.length = 0;
  h.routineStamps.length = 0;
  h.notifications.length = 0;
  h.background.length = 0;
});

describe("agent run notifications", () => {
  it("runs terminal side effects only for a transition to a terminal status", async () => {
    await stampRunResult("run-1", { status: "completed" });
    await Promise.all(h.background);

    expect(h.analytics).toHaveLength(1);
    expect(h.routineNotifications).toEqual(["run-1"]);
    expect(h.routineStamps).toEqual(["run-1"]);

    h.background.length = 0;
    await stampRunResult(
      "run-1",
      { provider_key_id: null },
      { guard: ["completed"] },
    );
    await Promise.all(h.background);

    expect(h.analytics).toHaveLength(1);
    expect(h.routineNotifications).toEqual(["run-1"]);
    expect(h.routineStamps).toEqual(["run-1"]);
  });

  it("leaves routine endings to the routine-specific notifier", async () => {
    await notifyAgentRun(terminalRun, "agent_done");
    expect(h.notifications).toHaveLength(0);
  });

  it("still notifies the owner for an ordinary agent run", async () => {
    await notifyAgentRun({ ...terminalRun, routine_id: null }, "agent_done");

    expect(h.notifications).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        type: "agent_done",
        agent_conversation_id: "conversation-1",
      }),
    ]);
  });
});
