import { describe, expect, it } from "vitest";
import {
  nextOccurrence,
  parseNumoWatchGrants,
  parseNumoWatchProposal,
  parseNumoWatchRecurrence,
  type NumoWatchRecurrence,
} from "./numo-watches";

const next = (recurrence: NumoWatchRecurrence, after: string, zone = "Europe/Paris") =>
  nextOccurrence(recurrence, zone, new Date(after)).toISOString();

describe("nextOccurrence", () => {
  const evening: NumoWatchRecurrence = { kind: "daily", time: "19:00" };

  it("comes back today when the time is still ahead, tomorrow once it has passed", () => {
    expect(next(evening, "2026-11-09T12:00:00Z")).toBe("2026-11-09T18:00:00.000Z");
    expect(next(evening, "2026-11-09T18:00:00Z")).toBe("2026-11-10T18:00:00.000Z");
  });

  it("keeps the wall-clock time across both changes of hour in Europe/Paris", () => {
    // Summer time starts on 28 March 2027: 19:00 moves from 18:00Z to 17:00Z.
    expect(next(evening, "2027-03-27T12:00:00Z")).toBe("2027-03-27T18:00:00.000Z");
    expect(next(evening, "2027-03-27T18:00:00Z")).toBe("2027-03-28T17:00:00.000Z");
    // And ends on 31 October 2027.
    expect(next(evening, "2027-10-30T17:00:00Z")).toBe("2027-10-31T18:00:00.000Z");
  });

  it("runs a time the change to summer time skips, once, that day", () => {
    const skipped: NumoWatchRecurrence = { kind: "daily", time: "02:30" };
    const at = next(skipped, "2027-03-27T12:00:00Z");
    expect(at.slice(0, 10)).toBe("2027-03-28");
    expect(next(skipped, at).slice(0, 10)).toBe("2027-03-29");
  });

  it("skips the weekend on weekdays: Friday evening leads to Monday", () => {
    const weekdays: NumoWatchRecurrence = { kind: "weekdays", time: "08:30" };
    // Friday 13 November 2026, after 08:30 in Paris.
    expect(next(weekdays, "2026-11-13T20:00:00Z")).toBe("2026-11-16T07:30:00.000Z");
    expect(next(weekdays, "2026-11-12T20:00:00Z")).toBe("2026-11-13T07:30:00.000Z");
  });

  it("comes back on its weekday, 1 being Monday and 7 Sunday", () => {
    expect(next({ kind: "weekly", time: "09:00", weekday: 1 }, "2026-11-09T09:00:00Z"))
      .toBe("2026-11-16T08:00:00.000Z");
    expect(next({ kind: "weekly", time: "09:00", weekday: 7 }, "2026-11-09T09:00:00Z"))
      .toBe("2026-11-15T08:00:00.000Z");
  });

  it("uses the last day of a month shorter than the day asked for", () => {
    const last: NumoWatchRecurrence = { kind: "monthly", time: "09:00", day: 31 };
    expect(next(last, "2027-01-31T12:00:00Z")).toBe("2027-02-28T08:00:00.000Z");
    expect(next(last, "2027-02-28T12:00:00Z")).toBe("2027-03-31T07:00:00.000Z");
    expect(next(last, "2028-02-01T00:00:00Z")).toBe("2028-02-29T08:00:00.000Z");
  });

  it("counts days on the reminder's calendar, not on UTC's", () => {
    // 23:30 on 9 November in Los Angeles is already 10 November in UTC.
    expect(next({ kind: "daily", time: "23:30" }, "2026-11-10T06:00:00Z", "America/Los_Angeles"))
      .toBe("2026-11-10T07:30:00.000Z");
  });
});

describe("recurrence and grants as stored", () => {
  it("accepts the four cadences and refuses what is not one", () => {
    expect(parseNumoWatchRecurrence({ kind: "daily", time: "19:00", weekday: 3 })).toEqual({ kind: "daily", time: "19:00" });
    expect(parseNumoWatchRecurrence({ kind: "weekly", time: "09:00", weekday: 7 }))
      .toEqual({ kind: "weekly", time: "09:00", weekday: 7 });
    expect(parseNumoWatchRecurrence({ kind: "monthly", time: "09:00", day: 31 }))
      .toEqual({ kind: "monthly", time: "09:00", day: 31 });
    for (const bad of [
      null, "daily", { kind: "hourly", time: "09:00" }, { kind: "daily", time: "9:00" },
      { kind: "daily", time: "24:00" }, { kind: "weekly", time: "09:00" },
      { kind: "weekly", time: "09:00", weekday: 0 }, { kind: "monthly", time: "09:00", day: 32 },
    ]) expect(parseNumoWatchRecurrence(bad)).toBeNull();
  });

  it("keeps each grant once and refuses an unknown one", () => {
    expect(parseNumoWatchGrants(["administration", "notification", "notification"]))
      .toEqual(["notification", "administration"]);
    expect(parseNumoWatchGrants(null)).toEqual([]);
    expect(parseNumoWatchGrants(["everything"])).toBeNull();
    expect(parseNumoWatchGrants("notification")).toBeNull();
  });

  it("reads a proposal back only when every part of it is valid", () => {
    const proposal = {
      id: "11111111-1111-4111-8111-111111111111", project_id: "22222222-2222-4222-8222-222222222222",
      instruction: "  Check the  costs ", recurrence: { kind: "weekly", time: "09:00", weekday: 1 },
      grants: ["administration"], timezone: "Europe/Paris", next_at: "2026-11-16T08:00:00.000Z", replaces: null,
    };
    expect(parseNumoWatchProposal(proposal)).toMatchObject({ instruction: "Check the costs", grants: ["administration"] });
    expect(parseNumoWatchProposal({ ...proposal, timezone: "Mars/Olympus" })).toBeNull();
    expect(parseNumoWatchProposal({ ...proposal, grants: ["root"] })).toBeNull();
    expect(parseNumoWatchProposal({ ...proposal, recurrence: null })).toBeNull();
    expect(parseNumoWatchProposal({ ...proposal, id: "not-an-id" })).toBeNull();
  });
});
