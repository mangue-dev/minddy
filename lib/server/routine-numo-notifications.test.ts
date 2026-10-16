import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoTurn } from "./numo/turns";
import { notificationTargetPath } from "@/lib/notification-target";

const h = vi.hoisted(() => ({
  jobs: [] as (() => Promise<void>)[],
  notify: vi.fn(),
}));
vi.mock("./after-safe", () => ({ afterOrNow: (job: () => Promise<void>) => h.jobs.push(job) }));
vi.mock("./notifications", () => ({ insertNotifications: h.notify }));
const service = {
  from: (table: string) => {
    const data = table === "numo_routine_occurrences"
      ? { id: "occurrence", routine_id: "routine", conversation_id: "numo-conversation" }
      : table === "agent_routines" ? { id: "routine", owner_id: "owner", project_id: "project" }
      : null;
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
beforeEach(() => { h.jobs = []; vi.clearAllMocks(); });

describe("Numo routine notification targets", () => {
  it.each(["completed", "failed", "stopped", "waiting_input"] as const)(
    "notifies a %s occurrence with the routine as its target", async (status) => {
      notifyRoutineOfNumoTurn({ id: "turn", conversation_id: "numo-conversation",
        status, intent: { routineId: "routine" } } as NumoTurn);
      await h.jobs[0]();
      const row = h.notify.mock.calls[0][1][0];
      expect(row).toMatchObject({ routine_id: "routine" });
      expect(notificationTargetPath(row)).toBe("/routines?routine=routine");
      expect(row.type).toBe(status === "waiting_input" ? "agent_question"
        : status === "completed" ? "routine_done" : "agent_failed");
    },
  );

});
