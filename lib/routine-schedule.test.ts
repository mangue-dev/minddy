import { describe, expect, it } from "vitest";
import {
  RoutineScheduleError,
  assertSchedule,
  describeSchedule,
  nextRunAt,
  type RoutineSchedule,
} from "./routine-schedule";

/**
 * Le calcul du prochain passage d'une routine (MIN-185). Ce qui se vérifie ici
 * est ce qui ne se voit pas à la lecture : le changement d'heure, les mois
 * courts, et le réarmement qui ne doit pas rejouer l'échéance qu'il vient de
 * consommer.
 */

const paris = (over: Partial<RoutineSchedule> = {}): RoutineSchedule => ({
  frequency: "weekly",
  hour: 9,
  minute: 0,
  weekdays: [1], // lundi
  timezone: "Europe/Paris",
  ...over,
});

/** L'heure locale d'un instant dans un fuseau — ce que l'horloge affiche. */
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
    // Jeudi 5 février 2026, midi UTC.
    const at = nextRunAt(paris(), new Date("2026-02-05T12:00:00Z"));
    expect(localClock(at, "Europe/Paris")).toBe("09/02/2026, 09:00");
  });

  it("tient 9 h locales DE PART ET D'AUTRE du changement d'heure", () => {
    // Paris passe à l'heure d'été le dimanche 29 mars 2026 : le lundi d'avant
    // est en UTC+1 (8 h UTC), celui d'après en UTC+2 (7 h UTC). Ajouter sept
    // fois 24 h aurait décalé la routine d'une heure pour toujours.
    const before = nextRunAt(paris(), new Date("2026-03-24T12:00:00Z"));
    const after = nextRunAt(paris(), new Date("2026-03-31T12:00:00Z"));
    expect(before.toISOString()).toBe("2026-03-30T07:00:00.000Z");
    expect(localClock(before, "Europe/Paris")).toBe("30/03/2026, 09:00");
    expect(after.toISOString()).toBe("2026-04-06T07:00:00.000Z");
    expect(localClock(after, "Europe/Paris")).toBe("06/04/2026, 09:00");

    // Et l'autre bascule, celle d'octobre (UTC+2 → UTC+1).
    const october = nextRunAt(paris(), new Date("2026-10-20T12:00:00Z"));
    expect(october.toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(localClock(october, "Europe/Paris")).toBe("26/10/2026, 09:00");
  });

  it("avance d'une semaine quand `from` est EXACTEMENT sur l'échéance", () => {
    // Le cas du cron qui réarme : sans le « strictement après », la routine
    // repartirait sur elle-même au tour suivant.
    const due = new Date("2026-02-09T08:00:00Z"); // lundi 9 h Paris (UTC+1)
    expect(localClock(due, "Europe/Paris")).toBe("09/02/2026, 09:00");
    const next = nextRunAt(paris(), due);
    expect(next.toISOString()).toBe("2026-02-16T08:00:00.000Z");
  });

  it("passe au lundi suivant quand l'heure du jour est déjà passée", () => {
    // Lundi 9 février, 10 h Paris : l'échéance de 9 h est derrière nous.
    const next = nextRunAt(paris(), new Date("2026-02-09T09:00:00Z"));
    expect(localClock(next, "Europe/Paris")).toBe("16/02/2026, 09:00");
  });
});

describe("nextRunAt — plusieurs jours", () => {
  it("prend le PROCHAIN des jours retenus, pas le premier de la liste", () => {
    // Lundi, mardi et jeudi. On est mardi 10 février à 10 h (l'échéance de 9 h
    // est passée) : la suivante est jeudi, pas lundi prochain.
    const next = nextRunAt(
      paris({ weekdays: [4, 1, 2] }),
      new Date("2026-02-10T09:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("12/02/2026, 09:00");
  });

  it("repart au premier jour de la semaine suivante après le dernier", () => {
    // Jeudi 12 février, 10 h : plus rien cette semaine → lundi 16.
    const next = nextRunAt(
      paris({ weekdays: [1, 2, 4] }),
      new Date("2026-02-12T09:00:00Z"),
    );
    expect(localClock(next, "Europe/Paris")).toBe("16/02/2026, 09:00");
  });

  it("enchaîne les jours du mois retenus dans l'ordre", () => {
    // Le 1, le 3 et le 12. Depuis le 4 février, la prochaine est le 12.
    const monthly = paris({
      frequency: "monthly",
      weekdays: null,
      daysOfMonth: [12, 1, 3],
    });
    expect(
      localClock(nextRunAt(monthly, new Date("2026-02-04T12:00:00Z")), "Europe/Paris"),
    ).toBe("12/02/2026, 09:00");
    // Après le 12, on bascule sur le 1er du mois suivant.
    expect(
      localClock(nextRunAt(monthly, new Date("2026-02-13T12:00:00Z")), "Europe/Paris"),
    ).toBe("01/03/2026, 09:00");
  });

  it("ne joue qu'UNE fois quand deux jours retombent au même endroit", () => {
    // 30 et 31 en février tombent tous les deux le 28 : c'est une occurrence.
    const at = nextRunAt(
      paris({ frequency: "monthly", weekdays: null, daysOfMonth: [30, 31] }),
      new Date("2026-02-01T12:00:00Z"),
    );
    expect(localClock(at, "Europe/Paris")).toBe("28/02/2026, 09:00");
    // Et la suivante est bien en mars, pas une seconde fois en février.
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
    // Le 29 mars 2026, Paris saute de 2 h à 3 h : 2 h 30 n'existe pas ce
    // jour-là. La routine doit repartir sur la première heure qui existe, pas
    // revenir en arrière ni disparaître.
    const next = nextRunAt(
      paris({ frequency: "daily", weekdays: null, hour: 2, minute: 30 }),
      new Date("2026-03-29T00:30:00Z"),
    );
    expect(next.getTime()).toBeGreaterThan(Date.parse("2026-03-29T00:30:00Z"));
    // Elle reste dans la journée du 29 (ou repart le 30), jamais avant.
    expect(next.toISOString() >= "2026-03-29T01:00:00.000Z").toBe(true);
  });
});

describe("nextRunAt — mensuel", () => {
  it("ramène le 31 au dernier jour d'un mois de 30 jours", () => {
    // On ne saute pas le mois : « le 31 » veut dire la fin du mois.
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
    // Le repli silencieux ferait partir la routine à la mauvaise heure sans que
    // personne ne le voie — c'est le contraire de ce qu'on veut d'une cadence.
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
    // Le piège du dépôt : un message à placeholders appelé sans valeurs affiche
    // le chemin de la clé. On vérifie donc que les valeurs arrivent.
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
