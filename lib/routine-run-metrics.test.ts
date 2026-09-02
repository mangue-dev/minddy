import { describe, expect, it } from "vitest";

import {
  formatRoutineRunDuration,
  routineRunUsagePercent,
} from "./routine-run-metrics";

describe("routine run metrics", () => {
  it("formats work time from started_at through completed_at", () => {
    expect(
      formatRoutineRunDuration(
        "2026-09-02T10:00:00.000Z",
        "2026-09-02T11:02:03.000Z",
      ),
    ).toBe("1h 2m");
    expect(
      formatRoutineRunDuration(
        "2026-09-02T10:00:00.000Z",
        "2026-09-02T10:04:08.000Z",
      ),
    ).toBe("4m 8s");
  });

  it("leaves incomplete or invalid durations unavailable", () => {
    expect(formatRoutineRunDuration("2026-09-02T10:00:00.000Z", null)).toBe("—");
    expect(formatRoutineRunDuration("invalid", "2026-09-02T10:00:00.000Z")).toBe(
      "—",
    );
  });

  it("calculates the run's share of the included monthly budget", () => {
    expect(routineRunUsagePercent(0.25, 5, "platform")).toBe(5);
  });

  it("does not assign included usage to BYOK runs", () => {
    expect(routineRunUsagePercent(0.25, 5, "byok")).toBeNull();
  });
});
