import { beforeEach, expect, it, vi } from "vitest";
import type { AgentRunEvent } from "./agent-api";
import { readAgentEvents } from "./agent-events-query";

const fetchEvents = vi.hoisted(() => vi.fn());
vi.mock("./agent-api", () => ({ fetchAgentRunEventsApi: fetchEvents }));
const event = (seq: number, text = "message"): AgentRunEvent => ({
  id: `event-${seq}`, seq, type: "summary", payload: { text }, created_at: "2026-10-04",
});
beforeEach(() => fetchEvents.mockReset());

it("fetches full history first and then merges only new ordered events", async () => {
  fetchEvents.mockResolvedValueOnce({ events: [event(1), event(2)] });
  const initial = await readAgentEvents("run", undefined, { now: 1000 });
  expect(fetchEvents).toHaveBeenLastCalledWith("run", undefined, undefined);
  fetchEvents.mockResolvedValueOnce({ events: [event(4), event(3), event(4)] });
  const next = await readAgentEvents("run", initial, { now: 3000 });
  expect(fetchEvents).toHaveBeenLastCalledWith("run", 2, undefined);
  expect(next.events.map(e => e.seq)).toEqual([1, 2, 3, 4]);
  expect(next.reconciledAt).toBe(1000);
});

it("periodically repairs late events, corrected payloads and removed history", async () => {
  const cached = { events: [event(1), event(3)], reconciledAt: 1000 };
  fetchEvents.mockResolvedValue({ events: [event(2), event(3, "corrected")] });
  const next = await readAgentEvents("run", cached, { now: 31_000 });
  expect(fetchEvents).toHaveBeenCalledWith("run", undefined, undefined);
  expect(next.events).toEqual([event(2), event(3, "corrected")]);
  expect(next.reconciledAt).toBe(31_000);
});

it("forces reconciliation on activation or invalidation and forwards cancellation", async () => {
  const signal = new AbortController().signal;
  fetchEvents.mockResolvedValue({ events: [] });
  await readAgentEvents("run", { events: [event(1)], reconciledAt: 1000 }, {
    now: 2000, full: true, signal,
  });
  expect(fetchEvents).toHaveBeenCalledWith("run", undefined, signal);
});

it("keeps cached history intact after failed delta reads and polls empty histories", async () => {
  const cached = { events: [event(1)], reconciledAt: 1000 };
  fetchEvents.mockRejectedValueOnce(new Error("Offline"));
  await expect(readAgentEvents("run", cached, { now: 2000 })).rejects.toThrow("Offline");
  expect(cached.events).toEqual([event(1)]);
  fetchEvents.mockResolvedValue({ events: [event(0)] });
  const initial = await readAgentEvents("run", { events: [], reconciledAt: 1000 }, { now: 2000 });
  expect(fetchEvents).toHaveBeenLastCalledWith("run", undefined, undefined);
  expect(initial.events).toEqual([event(0)]);
  await readAgentEvents("run", initial, { now: 3000 });
  expect(fetchEvents).toHaveBeenLastCalledWith("run", 0, undefined);
});
