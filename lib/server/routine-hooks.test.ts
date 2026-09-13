import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  insertNotifications: vi.fn(),
}));

const service = {
  from: () => ({
    select: () => ({
      is: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "routine-1", owner_id: "owner-1" } }),
        }),
      }),
    }),
  }),
};

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: (...args: unknown[]) => h.insertNotifications(...args),
}));

const { notifyRoutineOfRunEnd } = await import("./routine-hooks");

beforeEach(() => vi.clearAllMocks());

describe("routine completion notifications", () => {
  it("notifies the routine owner when a run suspends for necessary input", async () => {
    await notifyRoutineOfRunEnd({
      id: "run-1",
      routine_id: "routine-1",
      project_id: "project-1",
      status: "completed",
      pr_number: null,
      awaiting_input: true,
    });

    expect(h.insertNotifications).toHaveBeenCalledWith(
      service,
      [{
        user_id: "owner-1",
        project_id: "project-1",
        type: "agent_question",
        issue_id: null,
        routine_id: "routine-1",
        actor_id: null,
      }],
      { replaceUnread: true },
    );
  });
});
