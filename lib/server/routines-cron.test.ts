import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  due: vi.fn(),
  claim: vi.fn(),
  stamp: vi.fn(),
  start: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/lib/server/routine-event-processing", () => ({
  processRoutineEvents: vi.fn(async () => ({ processed: 0 })),
}));
vi.mock("@/lib/server/routines", () => ({
  claimRoutine: state.claim,
  dueRoutines: state.due,
  stampRoutineError: state.stamp,
}));
vi.mock("@/lib/server/routine-occurrences", () => ({ startRoutineOccurrence: state.start }));
vi.mock("@/lib/server/numo/turns", () => ({ executeNumoTurn: state.execute }));
vi.mock("@/lib/server/routine-hooks", () => ({ notifyRoutineLaunchFailure: vi.fn() }));
vi.mock("@/lib/server/numo/event-batches", () => ({
  drainNumoEventBatches: vi.fn(async () => ({ claimed: 0, outcomes: [] })),
}));
vi.mock("@/lib/server/numo/wake-triage", () => ({ triageNumoEventBatch: vi.fn() }));
vi.mock("@/lib/server/numo/watch-clock", () => ({
  runNumoWatchClock: vi.fn(async () => ({ expired: 0, fired: 0, canceled: 0, retried: 0 })),
}));
vi.mock("@/lib/server/ai-consent", () => ({
  aiDeclinedInBackground: vi.fn(async () => false),
  runAsBackgroundAiWork: (work: () => unknown) => work(),
}));

import { GET } from "@/app/api/cron/routines/route";

const request = () => new NextRequest("http://localhost/api/cron/routines", {
  headers: { authorization: `Bearer ${"x".repeat(32)}` },
});

const routine = (id: string) => ({ id, next_run_at: "2026-11-16T09:00:00.000Z", last_error: null });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "x".repeat(32));
  state.due.mockReset().mockResolvedValue([routine("posthog"), routine("supabase")]);
  state.claim.mockReset().mockResolvedValue({ claimed: true });
  state.stamp.mockReset().mockResolvedValue(undefined);
  state.start.mockReset().mockImplementation(async ({ routine: due }: { routine: { id: string } }) => ({
    occurrence: { id: `occurrence-${due.id}` },
    turn: { id: `turn-${due.id}`, status: "queued" },
  }));
  state.execute.mockReset();
});

// MIN-1008: two weekly routines due at the same time ran one after the other
// in this request; the second was killed by the 300-second limit mid-tool.
it("queues every due routine for the turn drain instead of running it here", async () => {
  const body = await (await GET(request())).json();
  expect(state.start).toHaveBeenCalledTimes(2);
  expect(state.execute).not.toHaveBeenCalled();
  expect(body.results).toEqual([
    { id: "posthog", outcome: "queued" },
    { id: "supabase", outcome: "queued" },
  ]);
  expect(state.stamp).toHaveBeenCalledWith("posthog", null);
  expect(state.stamp).toHaveBeenCalledWith("supabase", null);
});

it("records a launch failure when the occurrence cannot be admitted", async () => {
  state.start.mockRejectedValueOnce(Object.assign(new Error("boom"), { code: "numo_unavailable" }));
  const body = await (await GET(request())).json();
  expect(body.results[0]).toEqual({ id: "posthog", outcome: "numo_unavailable" });
  expect(state.stamp).toHaveBeenCalledWith("posthog", "launchFailed");
  expect(body.results[1]).toEqual({ id: "supabase", outcome: "queued" });
});
