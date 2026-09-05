import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ error: null as { message: string } | null }));
const query = {
  update: vi.fn(() => query),
  eq: vi.fn(() => query),
  in: vi.fn(async () => ({ error: h.error })),
};
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: () => query }),
}));
vi.mock("@/lib/server/notifications", () => ({ insertNotifications: vi.fn() }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/automations/hooks", () => ({ notifyChainOfRunEnd: vi.fn() }));
vi.mock("@/lib/server/routine-hooks", () => ({
  notifyRoutineOfRunEnd: vi.fn(), stampRoutineRunEnd: vi.fn(),
}));
vi.mock("@/lib/server/after-safe", () => ({ afterOrNow: vi.fn() }));
vi.mock("./live", () => ({ broadcastRunEvent: vi.fn() }));

const { requestInterrupt } = await import("./runs");

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
});
