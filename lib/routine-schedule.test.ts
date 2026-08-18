import { describe, expect, it } from "vitest";
import {
  RoutineScheduleError,
  assertSchedule,
  describeSchedule,
  nextRunAt,
  type RoutineSchedule,
} from "./routine-schedule";

/**
 * Calculation of the next pass of a routine (MIN-185). What is verified here
 * is what is not seen when reading: the time change, the short months
 *, and the rearmament which must not replay the deadline that it has just
 * consume.
 */

const paris = (over: Partial<RoutineSchedule> = {}): RoutineSchedule => ({
  frequency: "weekly",
  hour: 9,
  minute: 0,
  weekdays: [1], // lundi
  timezone: "Europe/Paris",
  ...over,
});

/** The local time of an instant in a time zone — what the clock displays. */
function localClock(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

describe("nextRunAt — hebdomadaire", () => {
  it("tombe sur le lundi suivant, à 9 h locales", () => {
    // Thursday February 5, 2026, noon UTC.
    const at = nextRunAt(paris(), new Date("2026-02-05T12:00:00Z"));
    expect(localClock(at, "Europe/Paris")).toBe("09/02/2026, 09:00");
  });

  it("tient 9 h locales DE PART ET D'AUTRE du changement d'heure", () => {
    // Paris switches to summer time on Sunday March 29, 2026: the Monday before
    // is in UTC+1 (8 a.m. UTC), the one after that in UTC+2 (7 a.m. UTC). Add seven
    // times 24 hours would have shifted the routine by an hour forever.
    const before = nextRunAt(paris(), new Date("2026-03-24T12:00:00Z"));
    const after = nextRunAt(paris(), new Date("2026-03-31T12:00:00Z"));
    expect(before.toISOString()).toBe("2026-03-30T07:00:00.000Z");
    expect(localClock(before, "Europe/Paris")).toBe("30/03/2026, 09:00");
    expect(after.toISOString()).toBe("2026-04-06T07:00:00.000Z");
    expect(localClock(after, "Europe/Paris")).toBe("06/04/2026, 09:00");

    // And the other switch, that of October (UTC+2 → UTC+1).
    const october = nextRunAt(paris(), new Date("2026-10-20T12:00:00Z"));
    expect(october.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(localClock(october, "Europe/Paris")).toBe("26/10/2026, 09:00");
  });

  it("avance d'une semaine quand `from` est EXACTEMENT sur l'échéance", () => {
    // The case of the cron which resets: without the “strictly after”, the routine
    // would start again on itself on the next turn.
    const due = new Date("2026-02-09T08:00:00Z"); // lundi 9 h Paris (UTC+1)
    expect(localClock(due, "Europe/Paris")).toBe("09/02/2026, 09:00");
    const next = nextRunAt(paris(), due);
    expect(next.toISOString()).toBe("2026-02-16T08:00:00.000Z");
  });

  it("passe au lundi suivant quand l'heure du jour est déjà passée", () => {
    // Monday February 9, 10 a.m. Paris: the 9 a.m. deadline is behind us.
    const next = nextRunAt(paris(), new Date("2026-02-09T09:00:00Z"));
    expect(localClock(next, "Europe/Paris")).toBe("16/02/2026, 09:00");
  });
});

describe("nextRunAt — plusieurs jours", () => {
  it("prend le PROCHAIN des jours retenus, pas le premier de la liste", () => {
    // Monday, Tuesday and Thursday. It's Tuesday, February 10 at 10 a.m. (the 9 a.m. deadline
    // has passed): the next one is Thursday, not next Monday.
    const next = nextRunAt(
      paris({ weekdays: [4, 1, 2] }),
      new Date("2026-02-10T09:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("12/02/2026, 09:00");
  });

  it("repart au premier jour de la semaine suivante après le dernier", () => {
    // Thursday February 12, 10 a.m.: nothing more this week → Monday 16.
    const next = nextRunAt(
      paris({ weekdays: [1, 2, 4] }),
      new Date("2026-02-12T09:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("16/02/2026, 09:00");
  });

  it("enchaîne les jours du mois retenus dans l'ordre", () => {
    // The 1st, the 3rd and the 12th. Since February 4th, the next one is the 12th.
    const monthly = paris({
      frequency: "monthly",
      weekdays: null,
      daysOfMonth: [12, 1, 3],
    });
    expect(
      localClock(nextRunAt(monthly, new Date("2026-02-04T12:00:00Z")), "Europe/Paris"),
    ).toBe("12/02/2026, 09:00");
    // After the 12th, we switch to the 1st of the following month.
    expect(
      localClock(nextRunAt(monthly, new Date("2026-02-13T12:00:00Z")), "Europe/Paris"),
    ).toBe("01/03/2026, 09:00");
  });

  it("ne joue qu'UNE fois quand deux jours retombent au même endroit", () => {
    // 30 and 31 in February both fall on the 28th: ​​this is an occurrence.
    const at = nextRunAt(
      paris({ frequency: "monthly", weekdays: null, daysOfMonth: [30, 31] }),
      new Date("2026-02-01T12:00:00Z"),
    );
    expect(localClock(at, "Europe/Paris")).toBe("28/02/2026, 09:00");
    // And the next one is in March, not a second time in February.
    expect(localClock(nextRunAt(paris({
      frequency: "monthly",
      weekdays: null,
      daysOfMonth: [30, 31],
    }), at), "Europe/Paris")).toBe("30/03/2026, 09:00");
  });
});

describe("nextRunAt — quotidien", () => {
  it("garde l'heure du jour même quand elle est encore devant", () => {
    const next = nextRunAt(
      paris({ frequency: "daily", weekdays: null, hour: 22 }),
      new Date("2026-02-05T12:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("05/02/2026, 22:00");
  });

  it("bascule à demain dès que l'heure du jour est passée", () => {
    const next = nextRunAt(
      paris({ frequency: "daily", weekdays: null, hour: 9 }),
      new Date("2026-02-05T12:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("06/02/2026, 09:00");
  });

  it("survit à une heure qui n'existe pas (bascule de printemps)", () => {
    // On March 29, 2026, Paris jumps from 2 a.m. to 3 a.m.: 2:30 a.m. does not exist this
    // that day. The routine must start again from the first hour that exists, not
    // go back or disappear.
    const next = nextRunAt(
      paris({ frequency: "daily", weekdays: null, hour: 2, minute: 30 }),
      new Date("2026-03-29T00:30:00Z"),
    );
    expect(next.getTime()).toBeGreaterThan(Date.parse("2026-03-29T00:30:00Z"));
    // She stays during the day of the 29th (or leaves on the 30th), never before.
    expect(next.toISOString() >= "2026-03-29T01:00:00.000Z").toBe(true);
  });
});

describe("nextRunAt — mensuel", () => {
  it("ramène le 31 au dernier jour d'un mois de 30 jours", () => {
    // We don’t skip the month: “the 31st” means the end of the month.
    const next = nextRunAt(
      paris({ frequency: "monthly", weekdays: null, daysOfMonth: [31] }),
      new Date("2026-04-15T12:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("30/04/2026, 09:00");
  });

  it("ramène le 31 au 28 février d'une année ordinaire", () => {
    const next = nextRunAt(
      paris({ frequency: "monthly", weekdays: null, daysOfMonth: [31] }),
      new Date("2026-02-01T12:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("28/02/2026, 09:00");
  });

  it("passe au mois suivant quand le jour est derrière nous", () => {
    const next = nextRunAt(
      paris({ frequency: "monthly", weekdays: null, daysOfMonth: [3] }),
      new Date("2026-02-15T12:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("03/03/2026, 09:00");
  });

  it("franchit décembre → janvier", () => {
    const next = nextRunAt(
      paris({ frequency: "monthly", weekdays: null, daysOfMonth: [5] }),
      new Date("2026-12-20T12:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("05/01/2027, 09:00");
  });
});

describe("assertSchedule", () => {
  it("REFUSE un fuseau inconnu au lieu de retomber sur UTC", () => {
    // Silent fallback would cause the routine to start at the wrong time without
    // no one sees it — it's the opposite of what we want from a cadence.
    expect(() => assertSchedule(paris({ timezone: "Europe/Pariss" }))).toThrow(
      RoutineScheduleError,
    );
    try {
      assertSchedule(paris({ timezone: "" }));
    } catch (err) {
      expect((err as RoutineScheduleError).code).toBe("unknownTimezone");
    }
  });

  it("refuse un weekday sur une cadence mensuelle, et l'inverse", () => {
    expect(() =>
      assertSchedule(paris({ frequency: "monthly", daysOfMonth: [1], weekdays: [3] })),
    ).toThrow(RoutineScheduleError);
    expect(() =>
      assertSchedule(paris({ frequency: "weekly", weekdays: [1], daysOfMonth: [12] })),
    ).toThrow(RoutineScheduleError);
    expect(() => assertSchedule(paris({ frequency: "weekly", weekdays: [] }))).toThrow(
      RoutineScheduleError,
    );
  });

  it("refuse une heure hors bornes", () => {
    expect(() => assertSchedule(paris({ hour: 24 }))).toThrow(RoutineScheduleError);
    expect(() => assertSchedule(paris({ minute: -1 }))).toThrow(RoutineScheduleError);
  });

  it("accepte une cadence bien formée", () => {
    expect(() => assertSchedule(paris())).not.toThrow();
    expect(() =>
      assertSchedule(paris({ frequency: "daily", weekdays: null })),
    ).not.toThrow();
  });
});

describe("describeSchedule", () => {
  it("appelle chaque message AVEC ses valeurs", () => {
    // The repository trap: a message to placeholders called without values ​​displays
    // the path of the key. We therefore check that the values ​​arrive.
    const seen: Array<[string, Record<string, string | number>]> = [];
    const t = (key: string, values: Record<string, string | number>) => {
      seen.push([key, values]);
      return key;
    };
    describeSchedule(paris(), t as never, { locale: "fr-FR" });
    expect(seen[0][0]).toBe("cadenceWeekly");
    expect(seen[0][1]).toMatchObject({ timezone: "Europe/Paris" });
    expect(String(seen[0][1].weekday)).toMatch(/lundi/i);
    expect(String(seen[0][1].time)).toContain("09");

    seen.length = 0;
    describeSchedule(paris({ frequency: "monthly", weekdays: null, daysOfMonth: [4] }), t as never);
    expect(seen[0][0]).toBe("cadenceMonthly");
    expect(String(seen[0][1].day)).toBe("4");
  });
});
