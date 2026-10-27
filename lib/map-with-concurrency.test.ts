import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./map-with-concurrency";

describe("mapWithConcurrency", () => {
  it("keeps input order even when later items finish first", async () => {
    // Ticks to wait per item: the first item settles last.
    const ticks = [6, 1, 4, 0, 2];
    const results = await mapWithConcurrency(ticks, 3, async (count, index) => {
      for (let i = 0; i < count; i++) await Promise.resolve();
      return index;
    });
    expect(results).toEqual([0, 1, 2, 3, 4]);
  });

  it("never runs more than the limit at once", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight--;
    });
    expect(peak).toBe(4);
  });

  it("returns an empty array for no items", async () => {
    expect(await mapWithConcurrency([], 8, async () => 1)).toEqual([]);
  });
});
