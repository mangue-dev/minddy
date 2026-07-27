import { describe, expect, it } from "vitest";
import { CHANGELOG_ENTRIES, CHANGELOG_LAST_MODIFIED } from "./changelog";
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
