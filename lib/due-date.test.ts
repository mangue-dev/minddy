import { describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  isDueDateOverdue,
  parseDueDate,
  relativeDue,
} from "./due-date";

/** Un instant LOCAL — `relativeDue` raisonne dans le fuseau du navigateur. */
const local = (
  y: number,
  m: number,
  d: number,
  h = 0,
  min = 0,
) => new Date(y, m - 1, d, h, min);

const NOW = local(2026, 7, 27, 14, 0); // lundi 27 juillet, 14 h

describe("calendarDaysBetween", () => {
  it("compte les jours, pas les heures", () => {
    // 23 h d'écart mais deux jours différents.
    expect(calendarDaysBetween(local(2026, 7, 27, 23, 30), local(2026, 7, 28, 0, 30))).toBe(1);
    // 10 h d'écart dans la même journée.
    expect(calendarDaysBetween(local(2026, 7, 27, 8), local(2026, 7, 27, 18))).toBe(0);
    expect(calendarDaysBetween(NOW, local(2026, 7, 24))).toBe(-3);
  });

  it("franchit les mois et les années", () => {
    expect(calendarDaysBetween(local(2026, 1, 31), local(2026, 2, 2))).toBe(2);
    expect(calendarDaysBetween(local(2026, 12, 30), local(2027, 1, 2))).toBe(3);
  });

  it("garde 1 jour à travers un changement d'heure", () => {
    // Nuit du passage à l'heure d'été (Europe) : 23 h de vraie durée.
    expect(calendarDaysBetween(local(2026, 3, 29, 12), local(2026, 3, 30, 12))).toBe(1);
    // …et du retour à l'heure d'hiver : 25 h.
    expect(calendarDaysBetween(local(2026, 10, 25, 12), local(2026, 10, 26, 12))).toBe(1);
  });
});

describe("relativeDue — les trois jours qui ont un nom", () => {
  it("nomme aujourd'hui, demain et hier", () => {
    expect(relativeDue(local(2026, 7, 27), NOW)).toEqual({
      kind: "named",
      day: "today",
      time: null,
    });
    expect(relativeDue(local(2026, 7, 28), NOW)).toMatchObject({
      kind: "named",
      day: "tomorrow",
    });
    expect(relativeDue(local(2026, 7, 26), NOW)).toMatchObject({
      kind: "named",
      day: "yesterday",
    });
  });

  it("porte l'heure quand le ticket en a une", () => {
    const due = local(2026, 7, 28, 14, 30);
    expect(relativeDue(due, NOW)).toEqual({
      kind: "named",
      day: "tomorrow",
      time: due,
    });
  });

  it("nomme encore le jour même quand l'heure est déjà passée", () => {
    // « aujourd'hui à 07:00 » à 14 h : c'est en retard, mais ça reste aujourd'hui.
    const due = local(2026, 7, 27, 7, 0);
    expect(relativeDue(due, NOW)).toMatchObject({ kind: "named", day: "today" });
    expect(isDueDateOverdue(due, NOW.getTime())).toBe(true);
  });
});

describe("relativeDue — au-delà, on compte", () => {
  it("compte les jours calendaires quand il n'y a pas d'heure", () => {
    // À 14 h, minuit du 30 est à 2 j 10 h — mais sans heure, c'est « dans 3 jours ».
    expect(relativeDue(local(2026, 7, 30), NOW)).toEqual({
      kind: "counted",
      days: 3,
      hours: 0,
      past: false,
    });
  });

  it("compte à l'envers pour le passé", () => {
    expect(relativeDue(local(2026, 7, 24), NOW)).toEqual({
      kind: "counted",
      days: 3,
      hours: 0,
      past: true,
    });
  });

  it("ajoute les heures quand le ticket porte une heure", () => {
    // Mercredi 17 h, depuis lundi 14 h : 2 jours et 3 heures.
    expect(relativeDue(local(2026, 7, 29, 17, 0), NOW)).toEqual({
      kind: "counted",
      days: 2,
      hours: 3,
      past: false,
    });
  });

  it("compte les heures à l'envers aussi", () => {
    expect(relativeDue(local(2026, 7, 24, 11, 0), NOW)).toEqual({
      kind: "counted",
      days: 3,
      hours: 3,
      past: true,
    });
  });

  it("rend 0 heure quand l'écart tombe juste", () => {
    // Même heure trois jours plus tard : rien à ajouter aux jours.
    expect(relativeDue(local(2026, 7, 30, 14, 0), NOW)).toEqual({
      kind: "counted",
      days: 3,
      hours: 0,
      past: false,
    });
  });

  it("arrondit à l'heure la plus proche plutôt que de tronquer", () => {
    // Une minute avant « 2 jours et 3 heures » : tronquer dirait 2 heures.
    const almost = new Date(NOW.getTime() + 2 * 86_400_000 + 3 * 3_600_000 - 60_000);
    expect(relativeDue(almost, NOW)).toEqual({
      kind: "counted",
      days: 2,
      hours: 3,
      past: false,
    });
  });

  it("ne dit jamais « 24 heures » : l'arrondi passe au jour suivant", () => {
    // 2 j 23 h 40 min → 72 h → « dans 3 jours », pas « 2 jours et 24 heures ».
    const nearlyThree = new Date(
      NOW.getTime() + 2 * 86_400_000 + 23 * 3_600_000 + 40 * 60_000,
    );
    expect(relativeDue(nearlyThree, NOW)).toEqual({
      kind: "counted",
      days: 3,
      hours: 0,
      past: false,
    });
  });

  it("ne descend jamais sous 1 jour dans la forme comptée", () => {
    // Cas limite : deux jours calendaires d'écart mais 25 h de durée réelle.
    const late = local(2026, 7, 27, 23, 30);
    const rel = relativeDue(local(2026, 7, 29, 0, 30), late);
    expect(rel).toEqual({ kind: "counted", days: 1, hours: 1, past: false });
  });
});

describe("isDueDateOverdue", () => {
  it("attend la fin du jour pour une échéance sans heure", () => {
    const today = local(2026, 7, 27);
    expect(isDueDateOverdue(today, NOW.getTime())).toBe(false);
    expect(isDueDateOverdue(today, local(2026, 7, 28, 0, 1).getTime())).toBe(true);
  });

  it("bascule dès l'heure passée pour une échéance datée", () => {
    expect(isDueDateOverdue(local(2026, 7, 27, 13, 59), NOW.getTime())).toBe(true);
    expect(isDueDateOverdue(local(2026, 7, 27, 14, 1), NOW.getTime())).toBe(false);
  });
});

describe("parseDueDate", () => {
  it("lit une valeur héritée comme minuit local, pas UTC", () => {
    const d = parseDueDate("2026-07-28");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(28);
    expect(d?.getHours()).toBe(0);
  });

  it("rend null sur vide ou illisible", () => {
    expect(parseDueDate(null)).toBeNull();
    expect(parseDueDate("")).toBeNull();
    expect(parseDueDate("un de ces jours")).toBeNull();
  });
});
