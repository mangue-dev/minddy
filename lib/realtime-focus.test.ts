import { describe, expect, it } from "vitest";
import { createWindowAwayTracker } from "./realtime-resume";

describe("window focus recovery", () => {
  it("measures an unfocused but visible window", () => {
    const tracker = createWindowAwayTracker();
    tracker.mark(1_000);

    expect(tracker.consume(21_000)).toBe(20_000);
  });

  it("coalesces blur and visibility signals without resetting the interval", () => {
    const tracker = createWindowAwayTracker();
    tracker.mark(1_000);
    tracker.mark(5_000);

    expect(tracker.consume(11_000)).toBe(10_000);
    expect(tracker.consume(12_000)).toBeNull();
  });
});
