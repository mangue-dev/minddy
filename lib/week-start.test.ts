import { describe, expect, it } from "vitest";
import {
  WEEK_START_META_KEY,
  localeWeekStart,
  orderedWeekdays,
  resolveWeekStart,
  resolveWeekStartPreference,
  weekdayRank,
} from "./week-start";

describe("week start preference", () => {
  it("defaults to auto when unset or invalid", () => {
    expect(resolveWeekStartPreference(null)).toBe("auto");
    expect(resolveWeekStartPreference({ [WEEK_START_META_KEY]: "friday" })).toBe("auto");
    expect(resolveWeekStartPreference({ [WEEK_START_META_KEY]: 1 })).toBe("auto");
    expect(resolveWeekStartPreference({ [WEEK_START_META_KEY]: "sunday" })).toBe("sunday");
  });

  it("follows the interface language in auto mode, as the date picker did", () => {
    expect(localeWeekStart("en")).toBe(0);
    expect(localeWeekStart("pt-BR")).toBe(0);
    for (const locale of ["fr", "de", "es", "it"]) expect(localeWeekStart(locale)).toBe(1);
  });

  it("lets a pinned day override the language", () => {
    expect(resolveWeekStart("auto", "fr")).toBe(1);
    expect(resolveWeekStart("sunday", "fr")).toBe(0);
    expect(resolveWeekStart("monday", "en")).toBe(1);
    expect(resolveWeekStart("saturday", "en")).toBe(6);
  });

  it("ranks and orders weekdays from the first day", () => {
    expect(orderedWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(orderedWeekdays(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(orderedWeekdays(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(weekdayRank(0, 1)).toBe(6);
    expect(weekdayRank(6, 6)).toBe(0);
    expect(weekdayRank(5, 6)).toBe(6);
  });
});
