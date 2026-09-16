import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { AssistantReasoningStream } = await import("./reasoning-stream");

describe("AssistantReasoningStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes server-timed progress alongside the streamed trace", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const stream = new AssistantReasoningStream({
      emit: (type: string, data: Record<string, unknown>) =>
        events.push({ type, data }),
    } as never);

    stream.push("Private intermediate trace");
    vi.advanceTimersByTime(500);

    expect(events.filter((event) => event.type !== "reasoning_delta").map(
      (event) => event.type,
    )).toEqual([
      "reasoning_start",
      "reasoning_tick",
      "reasoning_tick",
    ]);
    expect(events.at(-1)?.data).toEqual({ duration_ms: 500 });

    const completed = stream.finish();
    expect(completed).toEqual({
      text: "Private intermediate trace",
      durationMs: 500,
    });
    expect(events.at(-1)).toEqual({
      type: "reasoning_end",
      data: { duration_ms: 500, text: "Private intermediate trace" },
    });
  });

  it("streams the thinking as snapshots of the trace so far", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const stream = new AssistantReasoningStream({
      emit: (type: string, data: Record<string, unknown>) =>
        events.push({ type, data }),
    } as never);

    stream.push("First thought. ");
    stream.push("Second thought.");

    // Each push carries the ACCUMULATED text: a subscriber joining
    // mid-reflection replaces its copy instead of replaying missed chunks.
    const deltas = events.filter((event) => event.type === "reasoning_delta");
    expect(deltas.map((event) => event.data.text)).toEqual([
      "First thought. ",
      "First thought. Second thought.",
    ]);

    // And the end of reflection still re-states the final trace alone.
    const completed = stream.finish();
    expect(completed?.text).toBe("First thought. Second thought.");
    expect(events.at(-1)?.type).toBe("reasoning_end");
  });

  it("does not stream reasoning after the reflection has completed", () => {
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const stream = new AssistantReasoningStream({
      emit: (type: string, data: Record<string, unknown>) =>
        events.push({ type, data }),
    } as never);

    stream.push("One");
    stream.finish();
    stream.push("Stray late delta");

    expect(events.filter((event) => event.type === "reasoning_delta")).toHaveLength(1);
  });
});
