import { describe, expect, it } from "vitest";
import {
  CHANGELOG_LAST_MODIFIED,
  RECENT_CHANGELOG_DAYS,
  formatChangelogAge,
  hasRecentChangelog,
} from "./changelog";
import type { Locale } from "@/i18n/config";

/**
 * The blue dot in the account menu. The terminals are tested relative to
 * the last input: otherwise the test would turn off by itself as it ages.
 */
describe("changelog freshness", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const latest = Date.parse(`${CHANGELOG_LAST_MODIFIED}T00:00:00Z`);

  it("lights up on release day, including before UTC midnight", () => {
    expect(hasRecentChangelog(latest)).toBe(true);
    // Paris, 1 a.m. on the day of release: again the day before in UTC.
    expect(hasRecentChangelog(latest - 2 * 60 * 60 * 1000)).toBe(true);
  });

  it("lasts five days, not six", () => {
    expect(hasRecentChangelog(latest + RECENT_CHANGELOG_DAYS * DAY - 1)).toBe(
      true,
    );
    expect(hasRecentChangelog(latest + RECENT_CHANGELOG_DAYS * DAY)).toBe(
      false,
    );
  });
});

/** The age displayed instead of the date, on the public page and in the modal. */
describe("changelog age", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const published = Date.parse("2026-07-20T00:00:00Z");
  const age = (now: number, locale: Locale = "en") =>
    formatChangelogAge("2026-07-20", locale, now);

  it("counts in days in the served language", () => {
    expect(age(published)).toBe("today");
    expect(age(published + DAY)).toBe("yesterday");
    expect(age(published + 3 * DAY)).toBe("3 days ago");
    expect(age(published + 3 * DAY, "fr")).toBe("il y a 3 jours");
    expect(age(published + 3 * DAY, "de")).toBe("vor 3 Tagen");
    expect(age(published + 3 * DAY, "pt-BR")).toBe("há 3 dias");
    expect(age(published + 3 * DAY, "it")).toBe("3 giorni fa");
    expect(age(published + 3 * DAY, "es")).toBe("hace 3 días");
  });

  /**
   * Dates are written in UTC-midnight: a reader east of UTC opens the
   * page while today's delivery is still "in the future". Without
   * floor, the page would say "in 4 hours".
   */
  it("never describes a publication as being in the future", () => {
    expect(age(published - 4 * 60 * 60 * 1000)).toBe("today");
  });

  it("switches to months and then years instead of lining up days", () => {
    expect(age(published + 29 * DAY)).toBe("29 days ago");
    expect(age(published + 40 * DAY)).toBe("last month");
    expect(age(published + 200 * DAY)).toBe("6 months ago");
    expect(age(published + 400 * DAY)).toBe("last year");
  });
});
