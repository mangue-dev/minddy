import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ error: null as { message: string } | null }));
const query = {
  update: vi.fn(() => query),
  eq: vi.fn(() => query),
  in: vi.fn(async () => ({ error: h.error })),
  is: vi.fn(async () => ({ error: h.error })),
};
const from = vi.fn(() => query);
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from }),
}));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: vi.fn() }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/automations/hooks", () => ({ notifyChainOfRunEnd: vi.fn() }));
vi.mock("@/lib/server/routine-hooks", () => ({
  notifyRoutineOfRunEnd: vi.fn(), stampRoutineRunEnd: vi.fn(),
}));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("./live", () => ({ broadcastRunEvent: vi.fn() }));

const { discardPendingWorkerMessages, requestInterrupt } = await import("./runs");

beforeEach(() => {
  h.error = null;
  vi.clearAllMocks();
});

describe("durable Stop requests", () => {
  it("acknowledges a stored interrupt only for active runs", async () => {
    h.error = null;
    await expect(requestInterrupt("run-1")).resolves.toBeUndefined();
    expect(query.update).toHaveBeenCalledWith({ interrupt_requested: true });
    expect(query.in).toHaveBeenCalledWith("status", ["queued", "running"]);
  });

  it("surfaces storage failures so the optimistic UI can recover", async () => {
    h.error = { message: "database unavailable" };
    await expect(requestInterrupt("run-1")).rejects.toThrow("database unavailable");
  });

  it("discards only unconsumed steering for the stopped worker without reading content", async () => {
    await expect(discardPendingWorkerMessages("run-1")).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith("agent_run_messages");
    expect(query.update).toHaveBeenCalledWith({ consumed_at: expect.any(String) });
    expect(query.eq).toHaveBeenCalledWith("run_id", "run-1");
    expect(query.is).toHaveBeenCalledWith("consumed_at", null);
  });

  it("surfaces a failed steering discard instead of acknowledging the worker stop", async () => {
    h.error = { message: "database unavailable" };
    await expect(discardPendingWorkerMessages("run-1")).rejects.toThrow(
      "Unable to discard stopped worker messages",
    );
  });
});
