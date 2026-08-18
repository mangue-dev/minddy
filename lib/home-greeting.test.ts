import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { greetingPool, pickGreeting } from "./home-greeting";

/** On a given day, at a given time, locally — `new Date(y, m, d, h)` reads
 the machine's time zone, the same one that `greetingPool` queries. */
const at = (year: number, month: number, day: number, hour: number) =>
  new Date(year, month - 1, day, hour, 30);

// July 2026: the 6th is a Monday, the 8th is a Wednesday, the 10th is a Friday, the 11th
// a Saturday, the 12th a Sunday.
const MONDAY = 6;
const WEDNESDAY = 8;
const FRIDAY = 10;
const SATURDAY = 11;
const SUNDAY = 12;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DAYS = [MONDAY, WEDNESDAY, FRIDAY, SATURDAY, SUNDAY];

describe("greetingPool", () => {
  it("ne laisse jamais un vivier vide", () => {
    for (const day of DAYS) {
      for (const hour of HOURS) {
        expect(greetingPool(at(2026, 7, day, hour)).length).toBeGreaterThan(1);
      }
    }
  });

  it("varie selon l'heure : minuit et midi ne disent pas la même chose", () => {
    const midnight = greetingPool(at(2026, 7, WEDNESDAY, 0)).map((v) => v.key);
    const noon = greetingPool(at(2026, 7, WEDNESDAY, 12)).map((v) => v.key);
    expect(midnight.some((k) => noon.includes(k))).toBe(false);
  });

  it("dit encore « bonsoir » à 23 h, plus à 3 h", () => {
    const keys = (hour: number) =>
      greetingPool(at(2026, 7, WEDNESDAY, hour)).map((v) => v.key);
    expect(keys(23)).toContain("greetEvening");
    expect(keys(3)).not.toContain("greetEvening");
  });

  it("ajoute le week-end, le lundi matin et le vendredi — et pas ailleurs", () => {
    const keys = (day: number, hour: number) =>
      greetingPool(at(2026, 7, day, hour)).map((v) => v.key);

    expect(keys(SATURDAY, 10)).toContain("greetWeekend");
    expect(keys(SUNDAY, 20)).toContain("greetWeekend");
    expect(keys(WEDNESDAY, 10)).not.toContain("greetWeekend");

    expect(keys(MONDAY, 9)).toContain("greetMonday");
    // “New week” at 8 p.m. on a Monday is no longer news.
    expect(keys(MONDAY, 20)).not.toContain("greetMonday");

    expect(keys(FRIDAY, 15)).toContain("greetFriday");
    // Friday at 11 p.m., the weekend is no longer to be announced.
    expect(keys(FRIDAY, 23)).not.toContain("greetFriday");
  });
});

describe("pickGreeting", () => {
  it("rend toujours une formule, quelle que soit la graine", () => {
    const date = at(2026, 7, WEDNESDAY, 15);
    for (const seed of [0, 1, 7, 1234, 999_999_999]) {
      expect(pickGreeting(date, seed)).toBeDefined();
    }
  });

  it("balaie tout le vivier quand la graine tourne", () => {
    const date = at(2026, 7, WEDNESDAY, 9);
    const pool = greetingPool(date);
    const seen = new Set(pool.map((_, i) => pickGreeting(date, i).key));
    expect(seen.size).toBe(pool.length);
  });
});

describe("catalogue", () => {
  // The i18n contract test (lib/i18n-contract.test.ts) checks that the keys
  // CALLED exist; here they pass through a table, so it is
  // l'inverse qu'on veille : que chaque formule du vivier ait bien ses deux
  // messages, in both languages. A missing key would show
  // “Home.greetX” in big, bold letters at the top of the home page.
  const variants = [
    ...new Map(
      DAYS.flatMap((day) =>
        HOURS.flatMap((hour) =>
          greetingPool(at(2026, 7, day, hour)).map(
            (v) => [v.key, v] as const,
          ),
        ),
      ),
    ).values(),
  ];

  // `Home` no longer only wears chains since he also holds the
  // pool of tips (`Home.tips`, an object). Hence the value in `unknown`, then
  // the filter on the type: the lower `toBeTypeOf("string")` remain like this
  // tests for key presence, not sub-object reads.
  const message = (
    catalog: typeof en | typeof fr,
    key: string,
  ): string | undefined => {
    const value = (catalog.Home as Record<string, unknown>)[key];
    return typeof value === "string" ? value : undefined;
  };

  it("porte les deux formes de chaque formule, en anglais et en français", () => {
    for (const variant of variants) {
      for (const key of [variant.key, variant.keyNoName]) {
        expect(message(en, key), `en.Home.${key}`).toBeTypeOf("string");
        expect(message(fr, key), `fr.Home.${key}`).toBeTypeOf("string");
      }
    }
  });

  it("met `{name}` dans la forme nommée, et jamais dans l'autre", () => {
    for (const variant of variants) {
      for (const catalog of [en, fr] as const) {
        expect(message(catalog, variant.key)).toContain("{name}");
        expect(message(catalog, variant.keyNoName)).not.toContain("{name}");
      }
    }
  });

  it("dit la même chose des deux côtés, nom en moins", () => {
    // The safeguard of the register: the form without a name is the formula deprived of its sound
    // “,{name}”, not a different phrase. Two unrelated texts
    // would report a mismatched pair in the pool.
    for (const variant of variants) {
      for (const catalog of [en, fr] as const) {
        const named = message(catalog, variant.key)!;
        const anon = message(catalog, variant.keyNoName)!;
        expect(named.replace(/,?\s*\{name\}/, "")).toBe(anon);
      }
    }
  });
});
