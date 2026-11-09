import { describe, expect, it } from "vitest";
import { messageTimeLabel } from "./message-time";

// Local-time constructors keep the expectations independent of the machine's zone.
const now = new Date(2026, 10, 9, 15, 0);
const iso = (...parts: [number, number, number, number, number]) => new Date(...parts).toISOString();

describe("messageTimeLabel", () => {
  it("shows only the time for a message sent today", () => {
    expect(messageTimeLabel(iso(2026, 10, 9, 9, 5), "en-GB", now)).toBe("9:05");
  });

  it("adds the day and month earlier in the same year", () => {
    expect(messageTimeLabel(iso(2026, 10, 8, 23, 40), "en-GB", now)).toBe("8 Nov, 23:40");
  });

  it("adds the year for a message from another year", () => {
    expect(messageTimeLabel(iso(2025, 2, 3, 8, 0), "en-GB", now)).toBe("3 Mar 2025, 8:00");
  });

  it("returns nothing for an unreadable date", () => {
    expect(messageTimeLabel("not a date", "en-GB", now)).toBe("");
  });

  it("uses the 12- or 24-hour clock of the interface language", () => {
    const evening = iso(2026, 10, 9, 21, 5);
    expect(messageTimeLabel(evening, "en", now)).toBe("9:05 PM");
    for (const locale of ["fr", "de", "es", "it", "pt-BR"]) {
      expect(messageTimeLabel(evening, locale, now)).toBe("21:05");
    }
  });
});
