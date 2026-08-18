import { describe, expect, it } from "vitest";
import {
  DUE_SOON_MAX_DAYS,
  addDays,
  calendarDayInTz,
  daysBetweenDays,
  daysUntilDue,
  dueDateCalendarDay,
  dueSoonUpperBound,
  isDueSoon,
} from "./due-soon";
import type { IssueEffort, IssueStatus } from "./issue-constants";

const TODAY = "2026-07-27";

/** A deadline dated at noon UTC: far from the edges of the day, so the calendar day
 does not switch from one time zone to another (except dedicated test). */
const at = (day: string) => `${day}T12:00:00.000Z`;

function issue(
  overrides: Partial<{
    due_date: string | null;
    effort: IssueEffort | null;
    status: IssueStatus;
  }> = {},
) {
  return {
    due_date: at("2026-07-28"),
    effort: "m" as IssueEffort | null,
    status: "todo" as IssueStatus,
    ...overrides,
  };
}

describe("daysBetweenDays", () => {
  it("compte les jours calendaires", () => {
    expect(daysBetweenDays("2026-07-27", "2026-07-28")).toBe(1);
    expect(daysBetweenDays("2026-07-27", "2026-07-27")).toBe(0);
    expect(daysBetweenDays("2026-07-27", "2026-07-20")).toBe(-7);
  });

  it("franchit les mois et les années", () => {
    expect(daysBetweenDays("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetweenDays("2026-12-31", "2027-01-01")).toBe(1);
    // 2028 is a leap year: February 29 exists.
    expect(daysBetweenDays("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("traverse un changement d'heure sans perdre ni gagner de jour", () => {
    // Last Sunday in March: Europe switches to summer time.
    expect(daysBetweenDays("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("rend null sur une valeur illisible", () => {
    expect(daysBetweenDays("pas-une-date", "2026-07-27")).toBeNull();
  });
});

describe("addDays", () => {
  it("décale un jour calendaire", () => {
    expect(addDays("2026-07-27", 3)).toBe("2026-07-30");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-07-01", -1)).toBe("2026-06-30");
  });
});

describe("calendarDayInTz", () => {
  it("rend le jour du fuseau, pas celui d'UTC", () => {
    // 11 p.m. UTC = already the next day in Paris, again the day before in New York.
    const instant = new Date("2026-07-27T23:00:00.000Z");
    expect(calendarDayInTz(instant, "Europe/Paris")).toBe("2026-07-28");
    expect(calendarDayInTz(instant, "America/New_York")).toBe("2026-07-27");
    expect(calendarDayInTz(instant, "UTC")).toBe("2026-07-27");
  });

  it("retombe sur UTC quand le fuseau est absent ou invalide", () => {
    const instant = new Date("2026-07-27T23:00:00.000Z");
    expect(calendarDayInTz(instant, null)).toBe("2026-07-27");
    expect(calendarDayInTz(instant, "Mars/Olympus_Mons")).toBe("2026-07-27");
  });
});

describe("dueDateCalendarDay", () => {
  it("laisse une valeur héritée « YYYY-MM-DD » telle quelle", () => {
    // `date` column before the timestamptz migration: pass it through a time zone
    // would move it back a day.
    expect(dueDateCalendarDay("2026-07-28", "America/New_York")).toBe("2026-07-28");
  });

  it("ramène un timestamptz au jour du fuseau", () => {
    // Midnight UTC is still the night before in New York.
    expect(dueDateCalendarDay("2026-07-28T00:00:00.000Z", "America/New_York")).toBe(
      "2026-07-27",
    );
    expect(dueDateCalendarDay("2026-07-28T00:00:00.000Z", "Europe/Paris")).toBe(
      "2026-07-28",
    );
  });

  it("rend null sur une valeur illisible", () => {
    expect(dueDateCalendarDay("bientôt", "UTC")).toBeNull();
  });
});

describe("daysUntilDue", () => {
  it("compte 0 le jour même et négatif en retard", () => {
    expect(daysUntilDue(at(TODAY), TODAY, "UTC")).toBe(0);
    expect(daysUntilDue(at("2026-07-25"), TODAY, "UTC")).toBe(-2);
    expect(daysUntilDue(at("2026-08-04"), TODAY, "UTC")).toBe(8);
  });
});

describe("isDueSoon", () => {
  // The spec table: the window IS the Fibonacci weight of the effort.
  const WINDOWS: [IssueEffort | null, number][] = [
    ["xs", 1],
    ["s", 2],
    ["m", 3],
    ["l", 5],
    ["xl", 8],
    [null, 3], // sans effort → M
  ];

  for (const [effort, window] of WINDOWS) {
    it(`prend un ${effort ?? "sans effort"} à J+${window} et laisse J+${window + 1}`, () => {
      const inside = issue({ effort, due_date: at(addDays(TODAY, window)) });
      const outside = issue({ effort, due_date: at(addDays(TODAY, window + 1)) });
      expect(isDueSoon(inside, TODAY, "UTC")).toBe(true);
      expect(isDueSoon(outside, TODAY, "UTC")).toBe(false);
    });
  }

  it("garde les tickets en retard, si vieux soient-ils", () => {
    expect(isDueSoon(issue({ effort: "xs", due_date: at("2026-07-26") }), TODAY, "UTC")).toBe(
      true,
    );
    expect(isDueSoon(issue({ effort: "xs", due_date: at("2024-01-01") }), TODAY, "UTC")).toBe(
      true,
    );
  });

  it("écarte les statuts clos", () => {
    const tomorrow = at(addDays(TODAY, 1));
    for (const status of ["done", "canceled", "duplicate"] as IssueStatus[]) {
      expect(isDueSoon(issue({ effort: "xs", due_date: tomorrow, status }), TODAY, "UTC")).toBe(
        false,
      );
    }
    // Triage is not closed: a dated ticket counts there as elsewhere.
    expect(
      isDueSoon(issue({ effort: "xs", due_date: tomorrow, status: "triage" }), TODAY, "UTC"),
    ).toBe(true);
  });

  it("écarte les tickets sans échéance ou à échéance illisible", () => {
    expect(isDueSoon(issue({ due_date: null }), TODAY, "UTC")).toBe(false);
    expect(isDueSoon(issue({ due_date: "un de ces jours" }), TODAY, "UTC")).toBe(false);
  });

  it("tranche dans le fuseau de l'utilisateur", () => {
    // Deadline at midnight UTC on the 29th: it's still the 28th in New York (D+1, in the
    // window of an XS) but on the 29th in Paris (D+2, excluding window).
    const midnight = issue({ effort: "xs", due_date: "2026-07-29T00:00:00.000Z" });
    expect(isDueSoon(midnight, TODAY, "America/New_York")).toBe(true);
    expect(isDueSoon(midnight, TODAY, "Europe/Paris")).toBe(false);
  });
});

describe("dueSoonUpperBound", () => {
  it("dépasse le dernier jour retenu, avec la marge des fuseaux", () => {
    const bound = dueSoonUpperBound(TODAY);
    expect(bound).toBe("2026-08-06T00:00:00.000Z");
    // The last day possibly retained (XL) remains below the limit, whatever
    // or the time zone: midnight in Kiritimati (UTC+14) on day D+8.
    const lastDay = addDays(TODAY, DUE_SOON_MAX_DAYS);
    expect(`${lastDay}T23:59:59.999Z` < bound).toBe(true);
  });
});
