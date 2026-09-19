import { describe, expect, it } from "vitest";

import {
  buildUseCaseRows,
  startOfUtcWeek,
  WEEKS_SHOWN,
} from "./admin-decisions-quality";
import type { AdminDecisionsQualityWeek } from "@/lib/types";

/**
 * The weighting behind the admin “AI decisions” section (MIN-567): weeks of
 * very different traffic must weigh by their sample counts — an average of
 * per-week averages lets a one-sample week outweigh a hundred-sample week
 * and misleads the calibration. The window is the CALENDAR window (the six
 * weeks ending at the current one), so stale evidence can never pose as
 * "the last 6 weeks".
 */

/** Wednesday 2026-09-16, 12:00 UTC — the tests' frozen "now". */
const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);

/** The Monday of the week `k` weeks BEFORE the frozen now (0 = current). */
function weekStart(k: number): string {
  return new Date(startOfUtcWeek(NOW) - k * 7 * 86_400_000).toISOString();
}

function week(
  useCase: string,
  weekStartIso: string,
  overrides: Partial<AdminDecisionsQualityWeek> = {}
): AdminDecisionsQualityWeek {
  return {
    useCase,
    weekStart: weekStartIso,
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
    const rows = buildUseCaseRows(
      [
        week("smart_fill", weekStart(1), {
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
        week("smart_fill", weekStart(0), {
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
      ],
      NOW
    );
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
    const rows = buildUseCaseRows(
      [
        week("smart_fill", weekStart(0), {
          samples: 2,
          comparable: 0,
          replayFailed: 2,
        }),
      ],
      NOW
    );
    expect(rows[0].llmLatencyMs).toBeNull();
    expect(rows[0].llmCost).toBeNull();
    // The Jev leg ran on every sampled decision: present even without a replay.
    expect(rows[0].jevLatencyMs).toBeNull();
  });

  it("keeps weeks outside the calendar window out of the totals AND the series", () => {
    const weeks: AdminDecisionsQualityWeek[] = [
      week("smart_fill", weekStart(WEEKS_SHOWN + 1), {
        samples: 500,
        comparable: 500,
        agreeCount: 500,
        jevLatencySum: 999_999,
        jevLatencyCount: 500,
      }),
    ];
    for (let k = WEEKS_SHOWN - 1; k >= 0; k--) {
      weeks.push(
        week("smart_fill", weekStart(k), {
          samples: 4,
          comparable: 4,
          agreeCount: 4,
          jevLatencySum: 1600,
          jevLatencyCount: 4,
        })
      );
    }
    const rows = buildUseCaseRows(weeks, NOW);
    // Only the calendar window counts: the old heavy week is out.
    expect(rows[0].samples).toBe(WEEKS_SHOWN * 4);
    expect(rows[0].jevLatencyMs).toBe(400);
    expect(rows[0].series).toHaveLength(WEEKS_SHOWN);
    expect(rows[0].series[0]).toBe(1);
  });

  it("shows the stale evidence as an empty window, not as recent data", () => {
    const rows = buildUseCaseRows(
      [
        week("smart_fill", weekStart(WEEKS_SHOWN + 2), {
          samples: 50,
          comparable: 50,
          agreeCount: 50,
        }),
      ],
      NOW
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].samples).toBe(0);
    expect(rows[0].series).toEqual(Array(WEEKS_SHOWN).fill(null));
  });

  it("orders use cases canonically and shows a null slot for an empty week", () => {
    const rows = buildUseCaseRows(
      [
        week("smart_triage", weekStart(0), { comparable: 1, agreeCount: 0 }),
        week("smart_fill", weekStart(1), { comparable: 2, agreeCount: 1 }),
        week("smart_assign", weekStart(0), { comparable: 3, agreeCount: 3 }),
        week("custom_case", weekStart(0), { comparable: 1, agreeCount: 1 }),
      ],
      NOW
    );
    expect(rows.map((row) => row.useCase)).toEqual([
      "smart_fill",
      "smart_assign",
      "smart_triage",
      "custom_case",
    ]);
    // weekStart(1) = the second-to-last slot of the oldest→newest series.
    expect(rows[0].series[4]).toBe(0.5);
    expect(rows[0].series[5]).toBeNull();
  });

  it("spans exactly the last six calendar weeks, empty slots included", () => {
    const rows = buildUseCaseRows(
      [week("smart_fill", weekStart(2), { comparable: 1, agreeCount: 1 })],
      NOW
    );
    expect(rows[0].series).toHaveLength(WEEKS_SHOWN);
    // weekStart(2) sits two slots before the current week; the two after
    // it are empty — the window reaches the present.
    expect(rows[0].series[3]).toBe(1);
    expect(rows[0].series[4]).toBeNull();
    expect(rows[0].series[5]).toBeNull();
  });
});
