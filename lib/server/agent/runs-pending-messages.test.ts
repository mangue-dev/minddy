import { describe, expect, it, vi } from "vitest";

const query = {
  update: () => query,
  eq: () => query,
  is: () => query,
  select: async () => ({ data: null, error: { message: "storage unavailable" } }),
};
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: (table: string) => table === "agent_runs"
    ? { select: () => ({ eq: () => ({ maybeSingle: async () =>
      ({ data: { project_id: "project-1" }, error: null }) }) }) }
    : query }),
}));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: vi.fn() }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/automations/hooks", () => ({ notifyChainOfRunEnd: vi.fn() }));
vi.mock("@/lib/server/routine-hooks", () => ({
  notifyRoutineOfRunEnd: vi.fn(), stampRoutineRunEnd: vi.fn(),
}));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("./live", () => ({ broadcastRunEvent: vi.fn() }));

const { pullPendingMessages } = await import("./runs");

describe("pending agent messages", () => {
  it("stops the worker when the queue claim fails", async () => {
    await expect(pullPendingMessages("run-1")).rejects.toThrow(
      "Unable to claim pending agent messages");
  });
});
