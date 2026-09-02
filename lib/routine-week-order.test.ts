import { describe, expect, it } from "vitest";

import { orderRoutinesWithinWeek, routineWeekPosition } from "./routine-week-order";

const base = {
  frequency: "weekly" as const,
  hour: 9,
  minute: 0,
  weekdays: [1],
  daysOfMonth: [],
  timezone: "Europe/Paris",
};

describe("routine week ordering", () => {
  it("orders Monday morning before Sunday night regardless of the current day", () => {
    const ordered = orderRoutinesWithinWeek(
      [
        { ...base, title: "Sunday", weekdays: [0], hour: 23 },
        { ...base, title: "Monday late", hour: 10 },
        { ...base, title: "Monday early", hour: 1 },
      ],
      "en",
      new Date("2026-09-02T12:00:00Z"),
    );

    expect(ordered.map((routine) => routine.title)).toEqual([
      "Monday early",
      "Monday late",
      "Sunday",
    ]);
  });

  it("uses a weekly routine's first configured weekday", () => {
    expect(
      routineWeekPosition({ ...base, title: "Twice", weekdays: [4, 1] }),
    ).toBe(9 * 60);
  });

  it("places a daily routine at its Monday occurrence", () => {
    expect(
      routineWeekPosition({
        ...base,
        title: "Daily",
        frequency: "daily",
        weekdays: [],
        hour: 7,
      }),
    ).toBe(7 * 60);
  });

  it("projects a monthly routine's next occurrence in its schedule timezone", () => {
    expect(
      routineWeekPosition(
        {
          ...base,
          title: "Monthly",
          frequency: "monthly",
          weekdays: [],
          daysOfMonth: [7],
          hour: 1,
        },
        new Date("2026-09-02T12:00:00.000Z"),
      ),
    ).toBe(60);
  });

  it("returns a copy and uses titles to stabilize identical slots", () => {
    const input = [
      { ...base, title: "Beta" },
      { ...base, title: "Alpha" },
    ];

    const ordered = orderRoutinesWithinWeek(input, "en");

    expect(ordered).not.toBe(input);
    expect(ordered.map((routine) => routine.title)).toEqual(["Alpha", "Beta"]);
  });

  it("sorts invalid legacy schedules last", () => {
    const ordered = orderRoutinesWithinWeek([
      { ...base, title: "Invalid", weekdays: [9] },
      { ...base, title: "Valid" },
    ]);

    expect(ordered.map((routine) => routine.title)).toEqual(["Valid", "Invalid"]);
  });
});
