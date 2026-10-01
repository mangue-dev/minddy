import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoTurn } from "./numo/turns";
import { notificationTargetPath } from "@/lib/notification-target";

const h = vi.hoisted(() => ({
  jobs: [] as (() => Promise<void>)[],
  notify: vi.fn(),
  worker: null as null | { id: string; conversation_id: string; pr_number: number | null },
}));
vi.mock("./after-safe", () => ({ afterOrNow: (job: () => Promise<void>) => h.jobs.push(job) }));
vi.mock("./notifications", () => ({ insertNotifications: h.notify }));
const service = {
  from: (table: string) => {
    const data = table === "numo_routine_occurrences"
      ? { id: "occurrence", routine_id: "routine", conversation_id: "numo-conversation" }
      : table === "agent_routines" ? { id: "routine", owner_id: "owner", project_id: "project" }
      : h.worker;
    const chain = {
      select: () => chain, eq: () => chain, is: () => chain,
      update: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data, error: null }),
    };
    return chain;
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
const { notifyRoutineOfNumoTurn } = await import("./routine-hooks");
beforeEach(() => { h.jobs = []; h.worker = null; vi.clearAllMocks(); });

describe("Numo routine notification targets", () => {
  it.each(["completed", "failed", "stopped", "waiting_input"] as const)(
    "notifies a workerless %s occurrence without an incomplete delegated-work pair", async (status) => {
      notifyRoutineOfNumoTurn({ id: "turn", conversation_id: "numo-conversation",
        status, intent: { routineId: "routine" } } as NumoTurn);
      await h.jobs[0]();
      const row = h.notify.mock.calls[0][1][0];
      expect(row).toMatchObject({ routine_id: "routine", numo_conversation_id: null,
        numo_work_id: null, agent_conversation_id: null });
      expect(notificationTargetPath(row)).toBe("/routines?routine=routine");
      expect(row.type).toBe(status === "waiting_input" ? "agent_question"
        : status === "completed" ? "routine_done" : "agent_failed");
    },
  );

  it("retains the exact parent and work target when a delegated worker exists", async () => {
    h.worker = { id: "worker", conversation_id: "code-conversation", pr_number: 42 };
    notifyRoutineOfNumoTurn({ id: "turn", conversation_id: "numo-conversation",
      status: "completed", intent: { routineId: "routine" } } as NumoTurn);
    await h.jobs[0]();
    expect(h.notify.mock.calls[0][1][0]).toMatchObject({ type: "agent_done",
      numo_conversation_id: "numo-conversation", numo_work_id: "worker",
      agent_conversation_id: "code-conversation" });
  });
});
