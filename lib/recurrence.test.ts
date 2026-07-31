import { describe, expect, it } from "vitest";
import {
  isRecurrenceCadence,
  isRecurrenceOrNull,
  nextDueDate,
  nextDueDateISO,
  occurrencesBetween,
  startDueDate,
  startDueDateISO,
} from "./recurrence";

/** Les cas se lisent en UTC : c'est le repère du calcul (cf. lib/recurrence.ts),
    et celui du serveur qui crée les occurrences. */
const at = (iso: string) => new Date(iso);

describe("isRecurrenceCadence", () => {
  it("accepte les quatre cadences et rien d'autre", () => {
    expect(isRecurrenceCadence("weekly")).toBe(true);
    expect(isRecurrenceCadence("yearly")).toBe(true);
    expect(isRecurrenceCadence("hourly")).toBe(false);
    expect(isRecurrenceCadence(null)).toBe(false);
    expect(isRecurrenceOrNull(null)).toBe(true);
    expect(isRecurrenceOrNull("monthly")).toBe(true);
    expect(isRecurrenceOrNull("")).toBe(false);
  });
});

describe("nextDueDate", () => {
  it("avance d'une cadence quand l'échéance est encore devant", () => {
    const now = at("2026-07-27T10:00:00.000Z");
    expect(
      nextDueDate(at("2026-07-30T09:00:00.000Z"), "daily", now).toISOString(),
    ).toBe("2026-07-31T09:00:00.000Z");
    expect(
      nextDueDate(at("2026-07-30T09:00:00.000Z"), "weekly", now).toISOString(),
    ).toBe("2026-08-06T09:00:00.000Z");
    expect(
      nextDueDate(at("2026-07-30T09:00:00.000Z"), "monthly", now).toISOString(),
    ).toBe("2026-08-30T09:00:00.000Z");
    expect(
      nextDueDate(at("2026-07-30T09:00:00.000Z"), "yearly", now).toISOString(),
    ).toBe("2027-07-30T09:00:00.000Z");
  });

  it("garde l'heure de l'échéance", () => {
    const now = at("2026-07-27T23:30:00.000Z");
    expect(
      nextDueDate(at("2026-07-27T14:45:00.000Z"), "weekly", now).toISOString(),
    ).toBe("2026-08-03T14:45:00.000Z");
  });

  it("suit le rythme de l'échéance, pas celui de la clôture", () => {
    // Revue du lundi terminée le mercredi : la suivante reste un lundi.
    const monday = at("2026-07-27T09:00:00.000Z");
    const wednesday = at("2026-07-29T16:00:00.000Z");
    expect(nextDueDate(monday, "weekly", wednesday).toISOString()).toBe(
      "2026-08-03T09:00:00.000Z",
    );
  });

  it("rattrape un ticket très en retard plutôt que de naître dépassé", () => {
    const now = at("2026-07-27T10:00:00.000Z");
    // Hebdomadaire abandonnée depuis trois mois : la prochaine est à venir, et
    // reste alignée sur le lundi d'origine (6 avril + 17 semaines = 3 août —
    // le 27 juillet, 16 semaines, est déjà derrière `now`).
    const late = nextDueDate(at("2026-04-06T09:00:00.000Z"), "weekly", now);
    expect(late.getTime()).toBeGreaterThan(now.getTime());
    expect(late.toISOString()).toBe("2026-08-03T09:00:00.000Z");
    expect(late.getUTCDay()).toBe(1);
  });

  it("rattrape aussi une échéance vieille de dix ans sans partir en boucle", () => {
    const now = at("2026-07-27T10:00:00.000Z");
    const next = nextDueDate(at("2016-01-01T08:00:00.000Z"), "daily", now);
    expect(next.toISOString()).toBe("2026-07-28T08:00:00.000Z");
  });

  it("clampe le quantième à la fin du mois", () => {
    const now = at("2026-01-31T23:00:00.000Z");
    expect(
      nextDueDate(at("2026-01-31T09:00:00.000Z"), "monthly", now).toISOString(),
    ).toBe("2026-02-28T09:00:00.000Z");
    // Année bissextile.
    expect(
      nextDueDate(at("2028-01-31T09:00:00.000Z"), "monthly", at("2028-01-31T23:00:00.000Z"))
        .toISOString(),
    ).toBe("2028-02-29T09:00:00.000Z");
    // 29 février + 1 an : le 28.
    expect(
      nextDueDate(at("2028-02-29T09:00:00.000Z"), "yearly", at("2028-03-01T00:00:00.000Z"))
        .toISOString(),
    ).toBe("2029-02-28T09:00:00.000Z");
  });

  it("repart du quantième d'origine, pas du résultat clampé", () => {
    // 31 janvier, rattrapé jusqu'en mars : le 31 mars, pas le 28.
    const now = at("2026-03-15T10:00:00.000Z");
    expect(
      nextDueDate(at("2026-01-31T09:00:00.000Z"), "monthly", now).toISOString(),
    ).toBe("2026-03-31T09:00:00.000Z");
  });
});

describe("occurrencesBetween", () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it("liste les lundis d'un mois à partir de l'échéance", () => {
    const days = occurrencesBetween(
      at("2026-08-03T09:00:00.000Z"),
      "weekly",
      at("2026-08-01T00:00:00.000Z"),
      at("2026-08-31T23:59:59.999Z"),
    ).map(iso);
    expect(days).toEqual(["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]);
  });

  it("ne remonte jamais avant l'échéance de départ", () => {
    const days = occurrencesBetween(
      at("2026-08-17T09:00:00.000Z"),
      "weekly",
      at("2026-08-01T00:00:00.000Z"),
      at("2026-08-31T23:59:59.999Z"),
    ).map(iso);
    expect(days).toEqual(["2026-08-17", "2026-08-24", "2026-08-31"]);
  });

  it("montre le clamp de fin de mois là où il tombera vraiment", () => {
    // Un mensuel au 31 : février s'arrête au 28, et mars repart au 31.
    const days = occurrencesBetween(
      at("2026-01-31T09:00:00.000Z"),
      "monthly",
      at("2026-02-01T00:00:00.000Z"),
      at("2026-03-31T23:59:59.999Z"),
    ).map(iso);
    expect(days).toEqual(["2026-02-28", "2026-03-31"]);
  });

  it("couvre chaque jour d'une cadence quotidienne, sans dépasser la borne", () => {
    const days = occurrencesBetween(
      at("2026-08-01T09:00:00.000Z"),
      "daily",
      at("2026-08-01T00:00:00.000Z"),
      at("2026-08-31T23:59:59.999Z"),
    );
    expect(days).toHaveLength(31);
    expect(iso(days[30])).toBe("2026-08-31");
  });

  it("rend une liste vide quand la fenêtre est avant la série", () => {
    expect(
      occurrencesBetween(
        at("2026-08-03T09:00:00.000Z"),
        "weekly",
        at("2026-06-01T00:00:00.000Z"),
        at("2026-06-30T23:59:59.999Z"),
      ),
    ).toEqual([]);
  });
});

describe("startDueDate", () => {
  it("ne bouge pas une date encore devant", () => {
    const now = at("2026-07-27T10:00:00.000Z");
    expect(
      startDueDate(at("2026-07-30T09:00:00.000Z"), "weekly", now).toISOString(),
    ).toBe("2026-07-30T09:00:00.000Z");
  });

  it("lundi dernier en hebdomadaire donne lundi prochain", () => {
    // Lundi 20 juillet choisi un mercredi 29 : la série commence le 3 août
    // (le 27 est déjà passé), et reste un lundi.
    const now = at("2026-07-29T16:00:00.000Z");
    const start = startDueDate(at("2026-07-20T09:00:00.000Z"), "weekly", now);
    expect(start.toISOString()).toBe("2026-08-03T09:00:00.000Z");
    expect(start.getUTCDay()).toBe(1);
  });

  it("garde une échéance du jour : elle n'est pas en retard", () => {
    // « Sans heure » veut dire minuit LOCAL (c'est ce qu'écrit le picker), et
    // « en retard » se juge dans le même fuseau — ces deux cas se construisent
    // donc en heure locale, pas en UTC.
    const localMidnight = new Date(2026, 6, 27);
    const localMorning = new Date(2026, 6, 27, 9, 0);
    const now = new Date(2026, 6, 27, 18, 0);
    // Sans heure, l'échéance du jour vaut jusqu'au bout de la journée.
    expect(startDueDate(localMidnight, "daily", now).getTime()).toBe(
      localMidnight.getTime(),
    );
    // Avec une heure déjà passée, elle bascule au lendemain, même heure.
    const next = startDueDate(localMorning, "daily", now);
    expect(next.getTime() - localMorning.getTime()).toBe(86_400_000);
  });

  it("recale un quantième mensuel passé sur le mois en cours ou le suivant", () => {
    // Le 3 du mois, choisi le 15 juillet → 3 août.
    expect(
      startDueDate(
        at("2026-07-03T09:00:00.000Z"),
        "monthly",
        at("2026-07-15T10:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-08-03T09:00:00.000Z");
    // Le 20, choisi le 15 juillet → il est encore devant, on n'y touche pas.
    expect(
      startDueDate(
        at("2026-07-20T09:00:00.000Z"),
        "monthly",
        at("2026-07-15T10:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-07-20T09:00:00.000Z");
  });
});

describe("startDueDateISO", () => {
  it("rend la valeur stockée intacte quand elle n'est pas passée", () => {
    const now = at("2026-07-27T10:00:00.000Z");
    // Même chaîne, au caractère près : une écriture qui ne change rien ne doit
    // pas produire d'événement « échéance modifiée ».
    expect(startDueDateISO("2026-07-30T09:00:00+00:00", "weekly", now)).toBe(
      "2026-07-30T09:00:00+00:00",
    );
  });

  it("recale une valeur passée", () => {
    const now = at("2026-07-27T10:00:00.000Z");
    // 13 + 14 j = le 27 à 9 h, déjà passé à 10 h → le lundi d'après.
    expect(startDueDateISO("2026-07-13T09:00:00.000Z", "weekly", now)).toBe(
      "2026-08-03T09:00:00.000Z",
    );
  });

  it("rend null sans date de départ", () => {
    expect(startDueDateISO(null, "weekly")).toBeNull();
  });
});

describe("nextDueDateISO", () => {
  it("accepte l'ancienne forme « YYYY-MM-DD »", () => {
    const now = at("2026-07-27T10:00:00.000Z");
    const next = nextDueDateISO("2026-07-30", "weekly", now);
    expect(next).not.toBeNull();
    // Parsée comme minuit LOCAL (lib/due-date.ts), donc l'instant dépend du
    // fuseau de la machine — ce qui se vérifie, c'est l'écart d'une semaine.
    expect(new Date(next!).getTime() - new Date("2026-07-30T00:00:00").getTime()).toBe(
      7 * 86_400_000,
    );
  });

  it("rend null sans échéance de départ", () => {
    expect(nextDueDateISO(null, "weekly")).toBeNull();
    expect(nextDueDateISO("", "weekly")).toBeNull();
    expect(nextDueDateISO("pas une date", "weekly")).toBeNull();
  });
});
