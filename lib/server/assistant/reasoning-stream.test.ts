import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { AssistantReasoningStream } = await import("./reasoning-stream");

describe("AssistantReasoningStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes server-timed progress without exposing the live trace", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T12:00:00.000Z"));
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const stream = new AssistantReasoningStream({
      emit: (type: string, data: Record<string, unknown>) =>
        events.push({ type, data }),
    } as never);

    stream.push("Private intermediate trace");
    vi.advanceTimersByTime(500);

    expect(events.map((event) => event.type)).toEqual([
      "reasoning_start",
      "reasoning_tick",
      "reasoning_tick",
    ]);
    expect(events.at(-1)?.data).toEqual({ duration_ms: 500 });
    expect(JSON.stringify(events)).not.toContain("Private intermediate trace");

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
});
