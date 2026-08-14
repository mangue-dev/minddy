import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { greetingPool, pickGreeting } from "./home-greeting";

/** Un jour donné, à une heure donnée, en local — `new Date(y, m, d, h)` lit bien
    le fuseau de la machine, celui-là même que `greetingPool` interroge. */
const at = (year: number, month: number, day: number, hour: number) =>
  new Date(year, month - 1, day, hour, 30);

// Juillet 2026 : le 6 est un lundi, le 8 un mercredi, le 10 un vendredi, le 11
// un samedi, le 12 un dimanche.
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
    // « Nouvelle semaine » à 20 h un lundi n'est plus une nouvelle.
    expect(keys(MONDAY, 20)).not.toContain("greetMonday");

    expect(keys(FRIDAY, 15)).toContain("greetFriday");
    // Le vendredi à 23 h, la fin de semaine n'est plus à annoncer.
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
  // Le test de contrat i18n (lib/i18n-contract.test.ts) vérifie que les clés
  // APPELÉES existent ; ici elles transitent par une table, donc c'est à
  // l'inverse qu'on veille : que chaque formule du vivier ait bien ses deux
  // messages, dans les deux langues. Une clé manquante afficherait
  // « Home.greetX » en gros et en gras au sommet de l'accueil.
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

  // `Home` ne porte plus seulement des chaînes depuis qu'il tient aussi le
  // vivier d'astuces (`Home.tips`, un objet). D'où la valeur en `unknown`, puis
  // le filtre sur le type : les `toBeTypeOf("string")` plus bas restent ainsi
  // des tests de présence de la clé, et non des lectures de sous-objet.
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
    // Le garde-fou du registre : la forme sans nom est la formule amputée de son
    // « , {name} », pas une phrase différente. Deux textes sans rapport
    // signaleraient une paire mal appariée dans le vivier.
    for (const variant of variants) {
      for (const catalog of [en, fr] as const) {
        const named = message(catalog, variant.key)!;
        const anon = message(catalog, variant.keyNoName)!;
        expect(named.replace(/,?\s*\{name\}/, "")).toBe(anon);
      }
    }
  });
});
