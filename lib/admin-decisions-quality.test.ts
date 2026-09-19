import { describe, expect, it } from "vitest";

import {
  buildUseCaseRows,
  WEEKS_SHOWN,
} from "./admin-decisions-quality";
import type { AdminDecisionsQualityWeek } from "@/lib/types";

/**
 * The weighting behind the admin “AI decisions” section (MIN-567): weeks of
 * very different traffic must weigh by their sample counts — an average of
 * per-week averages lets a one-sample week outweigh a hundred-sample week
 * and misleads the calibration.
 */

function week(
  useCase: string,
  weekStart: string,
  overrides: Partial<AdminDecisionsQualityWeek> = {}
): AdminDecisionsQualityWeek {
  return {
    useCase,
    weekStart,
    samples: 0,
    comparable: 0,
    agreeCount: 0,
    replayFailed: 0,
    jevLatencySum: 0,
    jevLatencyCount: 0,
    llmLatencySum: 0,
    llmLatencyCount: 0,
    llmCostSum: 0,
    llmCostCount: 0,
    ...overrides,
  };
}

describe("buildUseCaseRows", () => {
  it("weighs latencies and cost by each week's sample count, not by week", () => {
    // The review's case: one sample in one week, hundreds in another — the
    // displayed averages must be per-sample figures over the whole window.
    const rows = buildUseCaseRows([
      week("smart_fill", "2026-09-07T00:00:00Z", {
        samples: 1,
        comparable: 1,
        agreeCount: 1,
        jevLatencySum: 1000,
        jevLatencyCount: 1,
        llmLatencySum: 10_000,
        llmLatencyCount: 1,
        llmCostSum: 0.01,
        llmCostCount: 1,
      }),
      week("smart_fill", "2026-09-14T00:00:00Z", {
        samples: 100,
        comparable: 100,
        agreeCount: 90,
        jevLatencySum: 200_000,
        jevLatencyCount: 100,
        llmLatencySum: 200_000,
        llmLatencyCount: 100,
        llmCostSum: 1.0,
        llmCostCount: 100,
      }),
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    // A plain average of averages would read 1055 ms and 1.05 s — wrong.
    expect(row.samples).toBe(101);
    expect(row.jevLatencyMs).toBeCloseTo((1000 + 200_000) / 101, 6);
    expect(row.llmLatencyMs).toBeCloseTo((10_000 + 200_000) / 101, 6);
    expect(row.llmCost).toBeCloseTo(1.01 / 101, 10);
    expect(row.agreeCount).toBe(91);
    expect(row.comparable).toBe(101);
  });

  it("returns null averages for a metric nothing measured", () => {
    const rows = buildUseCaseRows([
      week("smart_fill", "2026-09-14T00:00:00Z", {
        samples: 2,
        comparable: 0,
        replayFailed: 2,
      }),
    ]);
    expect(rows[0].llmLatencyMs).toBeNull();
    expect(rows[0].llmCost).toBeNull();
    // The Jev leg ran on every sampled decision: present even without a replay.
    expect(rows[0].jevLatencyMs).toBeNull();
  });

  it("keeps weeks without data out of the totals AND out of the series window", () => {
    const weeks: AdminDecisionsQualityWeek[] = [
      week("smart_fill", "2026-06-01T00:00:00Z", {
        samples: 500,
        comparable: 500,
        agreeCount: 500,
        jevLatencySum: 999_999,
        jevLatencyCount: 500,
      }),
    ];
    for (let i = WEEKS_SHOWN; i > 0; i--) {
      weeks.push(
        week("smart_fill", new Date(Date.UTC(2026, 7, 3 + 7 * (WEEKS_SHOWN - i))).toISOString(), {
          samples: 4,
          comparable: 4,
          agreeCount: 4,
          jevLatencySum: 1600,
          jevLatencyCount: 4,
        })
      );
    }
    const rows = buildUseCaseRows(weeks);
    // Only the last WEEKS_SHOWN weeks count: the old heavy week is out.
    expect(rows[0].samples).toBe(WEEKS_SHOWN * 4);
    expect(rows[0].jevLatencyMs).toBe(400);
    expect(rows[0].series).toHaveLength(WEEKS_SHOWN);
    expect(rows[0].series[0]).toBe(1);
  });

  it("orders use cases canonically and shows a null slot for an empty week", () => {
    const rows = buildUseCaseRows([
      week("smart_triage", "2026-09-14T00:00:00Z", { comparable: 1, agreeCount: 0 }),
      week("smart_fill", "2026-09-14T00:00:00Z", { comparable: 2, agreeCount: 1 }),
      week("smart_assign", "2026-09-14T00:00:00Z", { comparable: 3, agreeCount: 3 }),
      week("custom_case", "2026-09-14T00:00:00Z", { comparable: 1, agreeCount: 1 }),
    ]);
    expect(rows.map((row) => row.useCase)).toEqual([
      "smart_fill",
      "smart_assign",
      "smart_triage",
      "custom_case",
    ]);
    expect(rows[0].series[0]).toBe(0.5);
  });

  it("shows an empty series of the right length when nothing is comparable", () => {
    const rows = buildUseCaseRows([
      week("smart_fill", "2026-09-14T00:00:00Z"),
    ]);
    expect(rows[0].series).toEqual([null]);
  });

  it("caps the window at the last few weeks", () => {
    const weeks: AdminDecisionsQualityWeek[] = [];
    for (let i = WEEKS_SHOWN + 2; i > 0; i--) {
      weeks.push(
        week("smart_fill", new Date(Date.UTC(2026, 8, 1 + 7 * (WEEKS_SHOWN + 2 - i))).toISOString(), {
          comparable: 1,
          agreeCount: 1,
        })
      );
    }
    const rows = buildUseCaseRows(weeks);
    expect(rows[0].series).toHaveLength(WEEKS_SHOWN);
    expect(rows[0].comparable).toBe(WEEKS_SHOWN);
  });
});
