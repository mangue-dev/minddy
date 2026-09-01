import { describe, expect, it } from "vitest";

import { normalizeForgeInstant } from "./forge-time";

const now = new Date("2026-09-01T16:00:00.000Z");

describe("normalizeForgeInstant", () => {
  it("normalizes equivalent UTC offsets to the same instant", () => {
    expect(normalizeForgeInstant("2026-09-01T17:30:00+02:00", now)?.toISOString()).toBe(
      "2026-09-01T15:30:00.000Z",
    );
    expect(normalizeForgeInstant("2026-09-01T15:30:00Z", now)?.toISOString()).toBe(
      "2026-09-01T15:30:00.000Z",
    );
  });

  it("treats zone-less forge values as UTC", () => {
    expect(normalizeForgeInstant("2026-09-01T15:30:00", now)?.toISOString()).toBe(
      "2026-09-01T15:30:00.000Z",
    );
  });

  it("clamps future values to the shared current instant", () => {
    expect(normalizeForgeInstant("2026-09-01T20:00:00+02:00", now)?.toISOString()).toBe(
      now.toISOString(),
    );
  });

  it("returns null for missing and malformed values", () => {
    expect(normalizeForgeInstant(null, now)).toBeNull();
    expect(normalizeForgeInstant("not-a-date", now)).toBeNull();
  });
});
