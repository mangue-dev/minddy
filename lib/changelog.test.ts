import { describe, expect, it } from "vitest";
import {
  CHANGELOG_ENTRIES,
  CHANGELOG_LAST_MODIFIED,
  RECENT_CHANGELOG_DAYS,
  formatChangelogAge,
  hasRecentChangelog,
} from "./changelog";
import en from "../messages/en.json";
import fr from "../messages/fr.json";

/**
 * Le changelog est la seule page dont le contenu grandit à chaque livraison, et
 * dont la date pilote le sitemap. Ce qui peut mal tourner en l'alimentant est
 * donc toujours la même chose : une entrée sans texte, une date mal écrite, ou
 * une liste qu'on a complétée par le bas.
 */

const catalogues = { en: en.Changelog, fr: fr.Changelog } as Record<
  string,
  Record<string, string>
>;

describe("changelog entries", () => {
  it("has at least one entry", () => {
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
  });

  it("gives every entry a title and a body in both languages", () => {
    for (const entry of CHANGELOG_ENTRIES) {
      for (const [locale, messages] of Object.entries(catalogues)) {
        expect(
          messages[`entry_${entry.id}_title`],
          `${locale}.Changelog.entry_${entry.id}_title`,
        ).toBeTruthy();
        expect(
          messages[`entry_${entry.id}_body`],
          `${locale}.Changelog.entry_${entry.id}_body`,
        ).toBeTruthy();
      }
    }
  });

  it("writes dates as YYYY-MM-DD, and real ones", () => {
    for (const entry of CHANGELOG_ENTRIES) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // `2026-07-32` passe la regex mais pas ceci.
      expect(new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(entry.date);
    }
  });

  it("keeps ids unique — they are i18n keys, anchors and RSS guids", () => {
    const ids = CHANGELOG_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * La liste est rendue telle quelle, et sa première entrée devient le
   * `lastModified` de la page dans le sitemap. Une entrée ajoutée en bas
   * passerait donc inaperçue des moteurs, ce qui est exactement le contraire du
   * but.
   */
  it("stays sorted newest first", () => {
    const dates = CHANGELOG_ENTRIES.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(CHANGELOG_LAST_MODIFIED).toBe(dates[0]);
  });
});

/**
 * La pastille bleue du menu de compte. Les bornes sont testées relativement à
 * la dernière entrée : sinon le test s'éteindrait tout seul en vieillissant.
 */
describe("changelog freshness", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const latest = Date.parse(`${CHANGELOG_LAST_MODIFIED}T00:00:00Z`);

  it("s'allume le jour de la livraison, y compris avant minuit UTC", () => {
    expect(hasRecentChangelog(latest)).toBe(true);
    // Paris, 1 h du matin le jour de la sortie : encore la veille en UTC.
    expect(hasRecentChangelog(latest - 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("tient cinq jours, pas six", () => {
    expect(hasRecentChangelog(latest + RECENT_CHANGELOG_DAYS * DAY - 1)).toBe(true);
    expect(hasRecentChangelog(latest + RECENT_CHANGELOG_DAYS * DAY)).toBe(false);
  });
});

/** L'âge affiché à la place de la date, sur la page publique et dans le modal. */
describe("changelog age", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const published = Date.parse("2026-07-20T00:00:00Z");
  const age = (now: number, locale: "en" | "fr" = "en") =>
    formatChangelogAge("2026-07-20", locale, now);

  it("compte en jours, dans la langue servie", () => {
    expect(age(published)).toBe("today");
    expect(age(published + DAY)).toBe("yesterday");
    expect(age(published + 3 * DAY)).toBe("3 days ago");
    expect(age(published + 3 * DAY, "fr")).toBe("il y a 3 jours");
  });

  /**
   * Les dates sont écrites en UTC-minuit : un lecteur à l'est de l'UTC ouvre la
   * page alors que la livraison du jour est encore « dans le futur ». Sans
   * plancher, la page annoncerait « dans 4 heures ».
   */
  it("ne parle jamais au futur", () => {
    expect(age(published - 4 * 60 * 60 * 1000)).toBe("today");
  });

  it("passe aux mois puis aux années plutôt que d'aligner les jours", () => {
    expect(age(published + 29 * DAY)).toBe("29 days ago");
    expect(age(published + 40 * DAY)).toBe("last month");
    expect(age(published + 200 * DAY)).toBe("6 months ago");
    expect(age(published + 400 * DAY)).toBe("last year");
  });
});
