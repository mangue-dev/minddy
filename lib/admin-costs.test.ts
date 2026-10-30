import { describe, expect, it } from "vitest";

import {
  costGroupOf,
  costTotals,
  filterCostRows,
  NO_FILTERS,
  OTHER_SERIES,
  rankBy,
  relativeChange,
  splitPeriods,
  stackedSeries,
  windowDays,
} from "@/lib/admin-costs";
import type { AdminCostRow } from "@/lib/types";

function row(partial: Partial<AdminCostRow>): AdminCostRow {
  return {
    day: "2026-10-28",
    feature: "numo_chat",
    model: "deepseek/deepseek-v4-flash",
    costUsd: 1,
    calls: 1,
    promptTokens: 100,
    completionTokens: 50,
    cachedTokens: 0,
    ...partial,
  };
}

describe("admin costs arithmetic (MIN-829)", () => {
  it("files every feature under the family billing uses, plus the public site", () => {
    expect(costGroupOf("numo_chat")).toBe("numo");
    expect(costGroupOf("smart_fill")).toBe("automations");
    expect(costGroupOf("import_map")).toBe("automations");
    expect(costGroupOf("landing_demo")).toBe("site");
    expect(costGroupOf("pr_review")).toBe("other");
  });

  it("filters by family and model together", () => {
    const rows = [
      row({ feature: "numo_chat" }),
      row({ feature: "smart_fill" }),
      row({ feature: "numo_chat", model: "openai/gpt-5" }),
    ];
    expect(filterCostRows(rows, NO_FILTERS)).toHaveLength(3);
    expect(filterCostRows(rows, { group: "numo", model: "deepseek/deepseek-v4-flash" })).toEqual([rows[0]]);
  });

  it("totals spend, calls, tokens, cache hits and the price of a million tokens", () => {
    const totals = costTotals([
      row({ costUsd: 2, calls: 3, promptTokens: 800, completionTokens: 200, cachedTokens: 400 }),
      row({ costUsd: 1, calls: 1, promptTokens: 200, completionTokens: 0, cachedTokens: 100 }),
    ]);
    expect(totals).toEqual({ costUsd: 3, calls: 4, tokens: 1200, cacheHitRate: 0.5, costPerMillion: 2500 });
    expect(costTotals([])).toMatchObject({ cacheHitRate: null, costPerMillion: null });
  });

  it("compares with the previous period only when it had something", () => {
    expect(relativeChange(15, 10)).toBeCloseTo(0.5);
    expect(relativeChange(5, 0)).toBeNull();
    expect(relativeChange(null, 3)).toBeNull();
  });

  it("splits the window from the one before it", () => {
    const { current, previous } = splitPeriods([row({ day: "2026-10-01" }), row({ day: "2026-10-20" })], "2026-10-15");
    expect(current.map((r) => r.day)).toEqual(["2026-10-20"]);
    expect(previous.map((r) => r.day)).toEqual(["2026-10-01"]);
  });

  it("lists every day of the window, across a month boundary", () => {
    expect(windowDays("2026-10-30", 3)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("ranks by cost, then by calls", () => {
    const ranked = rankBy([row({ model: "a", costUsd: 1, calls: 1 }), row({ model: "b", costUsd: 1, calls: 5 }), row({ model: "a", costUsd: 2 })], (r) => r.model);
    expect(ranked.map((entry) => [entry.key, entry.costUsd])).toEqual([["a", 3], ["b", 1]]);
  });

  it("keeps the heaviest series and sums the rest as other, day by day", () => {
    const days = ["2026-10-27", "2026-10-28"];
    const series = stackedSeries(
      [
        row({ day: "2026-10-27", model: "a", costUsd: 5 }),
        row({ day: "2026-10-28", model: "b", costUsd: 3 }),
        row({ day: "2026-10-28", model: "c", costUsd: 1 }),
        row({ day: "2026-10-28", model: "d", costUsd: 0.5 }),
      ],
      days,
      (r) => r.model,
      (r) => r.costUsd,
      2,
    );
    expect(series.keys).toEqual(["a", "b", OTHER_SERIES]);
    expect(series.days[0].values).toEqual({ a: 5, b: 0, [OTHER_SERIES]: 0 });
    expect(series.days[1].values).toEqual({ a: 0, b: 3, [OTHER_SERIES]: 1.5 });
  });
});
