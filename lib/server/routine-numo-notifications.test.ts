import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NumoTurn } from "./numo/turns";
import { notificationTargetPath } from "@/lib/notification-target";

const h = vi.hoisted(() => ({
  jobs: [] as (() => Promise<void>)[],
  notify: vi.fn(),
}));
vi.mock("./after-safe", () => ({ afterOrNow: (job: () => Promise<void>) => h.jobs.push(job) }));
vi.mock("./notifications", () => ({ insertNotifications: h.notify }));
const updates: Record<string, unknown>[] = [];
const service = {
  from: (table: string) => {
    const data = table === "numo_routine_occurrences"
      ? { id: "occurrence", routine_id: "routine", conversation_id: "numo-conversation" }
      : table === "agent_routines" ? { id: "routine", owner_id: "owner", project_id: "project" }
      : null;
    const chain = {
      select: () => chain, eq: () => chain, is: () => chain,
      update: (values: Record<string, unknown>) => { updates.push(values); return chain; },
      order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data, error: null }),
    };
    return chain;
  },
};
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
const { notifyRoutineOfNumoTurn, notifyRoutineLaunchFailure } = await import("./routine-hooks");
beforeEach(() => { h.jobs = []; updates.length = 0; vi.clearAllMocks(); });

const turn = (status: NumoTurn["status"]) => ({ id: "turn", conversation_id: "numo-conversation",
  status, intent: { routineId: "routine" } }) as NumoTurn;
const runJobs = async () => { for (const job of h.jobs) await job(); };

describe("Numo routine notifications", () => {
  it("does not notify a successful run: the routine writes its own note when it has news", async () => {
    notifyRoutineOfNumoTurn(turn("completed"));
    await runJobs();
    expect(h.notify).not.toHaveBeenCalled();
    // The routine still reads as healthy again.
    expect(updates).toEqual([{ last_error: null }]);
  });

  it.each([
    ["failed", "agent_failed", "launchFailed"],
    ["stopped", "agent_failed", "launchFailed"],
    ["waiting_input", "agent_question", undefined],
  ] as const)("notifies the owner of a %s run, with the routine as its target",
    async (status, type, lastError) => {
      notifyRoutineOfNumoTurn(turn(status));
      await runJobs();
      expect(h.notify).toHaveBeenCalledTimes(1);
      const [, rows, options] = h.notify.mock.calls[0];
      expect(rows).toEqual([expect.objectContaining({ user_id: "owner", type, routine_id: "routine" })]);
      expect(options).toEqual({ replaceUnread: true });
      expect(notificationTargetPath(rows[0])).toBe("/routines?routine=routine");
      expect(updates).toEqual(lastError ? [{ last_error: lastError }] : []);
    });

  it("notifies a run that ended because its budget ran out", async () => {
    notifyRoutineOfNumoTurn(turn("completed"), { usageExhausted: true });
    await runJobs();
    expect(h.notify.mock.calls[0][1][0]).toMatchObject({ type: "agent_failed", routine_id: "routine" });
    expect(updates).toEqual([{ last_error: "quota" }]);
  });

  it("ignores a turn that does not belong to a routine", async () => {
    notifyRoutineOfNumoTurn({ ...turn("failed"), intent: {} } as NumoTurn);
    expect(h.jobs).toHaveLength(0);
  });

  it("tells the owner when a run could not start", async () => {
    notifyRoutineLaunchFailure({ id: "routine", owner_id: "owner", project_id: "project" });
    await runJobs();
    expect(h.notify.mock.calls[0][1][0]).toMatchObject({
      user_id: "owner", project_id: "project", type: "agent_failed", routine_id: "routine",
    });
  });
});
