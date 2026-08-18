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
 * The changelog is the only page whose content grows with each delivery, and
 * whose date drives the sitemap. What can go wrong when feeding it is
 * so always the same thing: an entry without text, a poorly written date, or
 * a list that has been completed from the bottom.
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
      // `2026-07-32` passes the regex but not this.
      expect(new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(entry.date);
    }
  });

  it("keeps ids unique — they are i18n keys, anchors and RSS guids", () => {
    const ids = CHANGELOG_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
 * The list is rendered as is, and its first entry becomes the page's
 * `lastModified` in the sitemap. An entry added at the bottom
 * would therefore go unnoticed by the engines, which is exactly the opposite of
 * but.
 */
  it("stays sorted newest first", () => {
    const dates = CHANGELOG_ENTRIES.map((entry) => entry.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(CHANGELOG_LAST_MODIFIED).toBe(dates[0]);
  });
});

/**
 * The blue dot in the account menu. The terminals are tested relative to
 * the last input: otherwise the test would turn off by itself as it ages.
 */
describe("changelog freshness", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const latest = Date.parse(`${CHANGELOG_LAST_MODIFIED}T00:00:00Z`);

  it("s'allume le jour de la livraison, y compris avant minuit UTC", () => {
    expect(hasRecentChangelog(latest)).toBe(true);
    // Paris, 1 a.m. on the day of release: again the day before in UTC.
    expect(hasRecentChangelog(latest - 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("tient cinq jours, pas six", () => {
    expect(hasRecentChangelog(latest + RECENT_CHANGELOG_DAYS * DAY - 1)).toBe(true);
    expect(hasRecentChangelog(latest + RECENT_CHANGELOG_DAYS * DAY)).toBe(false);
  });
});

/** The age displayed instead of the date, on the public page and in the modal. */
describe("changelog age", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const published = Date.parse("2026-07-20T00:00:00Z");
  const age = (now: number, locale: "en" | "fr" = "en") =>
    formatChangelogAge("2026-07-20", locale, now);

  it("counts in days in the served language", () => {
    expect(age(published)).toBe("today");
    expect(age(published + DAY)).toBe("yesterday");
    expect(age(published + 3 * DAY)).toBe("3 days ago");
    expect(age(published + 3 * DAY, "fr")).toBe("il y a 3 jours");
  });

  /**
 * Dates are written in UTC-midnight: a reader east of UTC opens the
 * page while today's delivery is still "in the future". Without
 * floor, the page would say "in 4 hours".
 */
  it("ne parle jamais au futur", () => {
    expect(age(published - 4 * 60 * 60 * 1000)).toBe("today");
  });

  it("switches to months and then years instead of lining up days", () => {
    expect(age(published + 29 * DAY)).toBe("29 days ago");
    expect(age(published + 40 * DAY)).toBe("last month");
    expect(age(published + 200 * DAY)).toBe("6 months ago");
    expect(age(published + 400 * DAY)).toBe("last year");
  });
});
