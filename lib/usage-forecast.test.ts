import { describe, expect, it } from "vitest";
import { forecastUsage } from "./usage-forecast";

const PERIOD = {
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: "2026-12-01T00:00:00Z",
};

/** One bucket per UTC day from Nov 1, with the given spend. */
function days(spend: number[]) {
  return spend.map((usd, i) => ({
    day: `2026-11-${String(i + 1).padStart(2, "0")}`,
    usd,
  }));
}

describe("usage forecast", () => {
  it("gives no verdict before a full day or without usage", () => {
    expect(
      forecastUsage({
        ...PERIOD,
        days: days([3]),
        includedUsd: 10,
        observedAt: "2026-11-01T20:00:00Z",
      })?.status,
    ).toBe("too_early");
    expect(
      forecastUsage({
        ...PERIOD,
        days: days([0, 0, 0]),
        includedUsd: 10,
        observedAt: "2026-11-03T12:00:00Z",
      })?.status,
    ).toBe("too_early");
  });

  it("has nothing to forecast without an included budget", () => {
    expect(
      forecastUsage({
        ...PERIOD,
        days: days([1]),
        includedUsd: 0,
        observedAt: "2026-11-02T00:00:00Z",
      }),
    ).toBeNull();
  });

  it("projects a steady pace to the end of the period", () => {
    // 0.1 a day over 10 days: 1 of 10 used, 3 of 10 by the end of the month.
    const forecast = forecastUsage({
      ...PERIOD,
      days: days(Array(10).fill(0.1)),
      includedUsd: 10,
      observedAt: "2026-11-11T00:00:00Z",
    })!;
    expect(forecast.status).toBe("on_track");
    expect(forecast.usedPercent).toBeCloseTo(10);
    expect(forecast.projectedPercent).toBeCloseTo(30);
    expect(forecast.runsOutAt).toBeNull();
    expect(forecast.points[0]).toEqual({
      at: Date.parse("2026-11-11T00:00:00Z"),
      percent: forecast.usedPercent,
    });
    expect(forecast.points.at(-1)).toEqual({
      at: Date.parse(PERIOD.periodEnd),
      percent: forecast.projectedPercent,
    });
  });

  it("says when the budget runs out before the reset", () => {
    // 0.5 a day over 10 days: 5 of 10 used, 10 more days of budget.
    const forecast = forecastUsage({
      ...PERIOD,
      days: days(Array(10).fill(0.5)),
      includedUsd: 10,
      observedAt: "2026-11-11T00:00:00Z",
    })!;
    expect(forecast.status).toBe("short");
    expect(forecast.runsOutAt).toBe("2026-11-21T00:00:00.000Z");
    expect(forecast.daysShort).toBe(10);
  });

  it("weighs a recent burst above a quiet start", () => {
    // Nothing for 13 days, then 0.8 a day for the last 7: the average pace
    // alone would end at 84 %, the blended one runs out before the reset.
    const forecast = forecastUsage({
      ...PERIOD,
      days: days([...Array(13).fill(0), ...Array(7).fill(0.8)]),
      includedUsd: 10,
      observedAt: "2026-11-21T00:00:00Z",
    })!;
    expect(forecast.status).toBe("short");
    expect(forecast.runsOutAt! < PERIOD.periodEnd).toBe(true);
  });

  it("calls a nearly spent end of period tight", () => {
    const forecast = forecastUsage({
      ...PERIOD,
      days: days(Array(15).fill(0.3)),
      includedUsd: 10,
      observedAt: "2026-11-16T00:00:00Z",
    })!;
    expect(forecast.projectedPercent).toBeCloseTo(90);
    expect(forecast.status).toBe("tight");
  });

  it("reports a spent budget as exhausted", () => {
    const forecast = forecastUsage({
      ...PERIOD,
      days: days([6, 5]),
      includedUsd: 10,
      observedAt: "2026-11-02T12:00:00Z",
    })!;
    expect(forecast.status).toBe("exhausted");
    expect(forecast.points).toEqual([]);
  });
});
