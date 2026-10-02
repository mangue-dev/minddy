import { describe, expect, it } from "vitest";
import { buildUsageDays } from "./usage-analytics";

describe("full-window usage days", () => {
  it("fills inactive days without inventing future observations", () => {
    const days = buildUsageDays(
      [
        { day: "2026-09-10", feature: "agent_code", cost: "1.5" },
        { day: "2026-09-10", feature: "sandbox_compute", cost: 0.5 },
        { day: "2026-09-12", feature: "routine_compute", cost: 0.7 },
        { day: "2026-09-15", feature: "numo_chat", cost: 99 },
      ],
      "2026-09-10T12:00:00Z",
      "2026-10-10T12:00:00Z",
      "2026-09-12T10:00:00Z",
    );
    expect(days.map((day) => day.day)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
    expect(days.map((day) => day.usd)).toEqual([2, 0, 0.7]);
    expect(days[0].segments.find((s) => s.id === "agents")?.usd).toBe(2);
    expect(days[2].segments.find((s) => s.id === "routines")?.usd).toBe(0.7);
  });

  it("respects an intraday reset and the exclusive period end", () => {
    const days = buildUsageDays(
      [
        { day: "2026-09-09", feature: "numo_chat", cost: 20 },
        { day: "2026-09-10", feature: "numo_chat", cost: 0.000001 },
        { day: "2026-09-11", feature: "numo_chat", cost: 20 },
      ],
      "2026-09-10T23:30:00Z",
      "2026-09-11T00:00:00Z",
      "2026-09-12T00:00:00Z",
    );
    expect(days).toHaveLength(1);
    expect(days[0].usd).toBe(0.000001);
  });

  it("preserves unrecognized ledger costs and rejects invalid amounts", () => {
    const days = buildUsageDays(
      [
        { day: "2026-09-10", feature: "future_feature", cost: 0.25 },
        { day: "2026-09-10", feature: "numo_chat", cost: "NaN" },
        { day: "2026-09-10", feature: "numo_chat", cost: -1 },
      ],
      "2026-09-10T00:00:00Z",
      "2026-10-10T00:00:00Z",
      "2026-09-10T01:00:00Z",
    );
    expect(days[0].usd).toBe(0.25);
    expect(days[0].segments.reduce((sum, s) => sum + s.usd, 0)).toBe(0.25);
  });

  it("returns no days for a reset later than the observation or an invalid window", () => {
    expect(
      buildUsageDays(
        [],
        "2026-09-12T00:00:00Z",
        "2026-10-10T00:00:00Z",
        "2026-09-10T00:00:00Z",
      ),
    ).toEqual([]);
    expect(
      buildUsageDays(
        [],
        "invalid",
        "2026-10-10T00:00:00Z",
        "2026-09-10T00:00:00Z",
      ),
    ).toEqual([]);
  });
});
