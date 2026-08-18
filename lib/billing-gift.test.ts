import { describe, expect, it } from "vitest";

import {
  DEFAULT_GIFT_DURATION,
  GIFT_DURATIONS,
  coerceGiftDuration,
  giftExpiresAt,
  isGiftExpired,
} from "./billing-gift";

/**
 * Give a plan for a given time.
 *
 * What these tests protect: A gift STOPS. The right does not fall because
 * a cron has passed, but because the read refuses an expired override —
 * it is `isGiftExpired` * which carries this promise, and the shift of one second
 * in one direction or the other is the difference between "one month offered" and
 * "offered for always”.
 */

const NOW = new Date("2026-08-04T09:30:00.000Z");

describe("giftExpiresAt", () => {
  it("compte les mois en calendrier, pas en tranches de 30 jours", () => {
    expect(giftExpiresAt("1m", NOW)).toBe("2026-09-04T09:30:00.000Z");
    expect(giftExpiresAt("3m", NOW)).toBe("2026-11-04T09:30:00.000Z");
    expect(giftExpiresAt("1y", NOW)).toBe("2027-08-04T09:30:00.000Z");
  });

  it("clampe le jour au dernier jour du mois cible", () => {
    // A free month on January 31 ends at the end of February, never at the beginning of March: otherwise
    // the gift would last one day longer than announced.
    expect(giftExpiresAt("1m", new Date("2026-01-31T12:00:00.000Z"))).toBe(
      "2026-02-28T12:00:00.000Z"
    );
    expect(giftExpiresAt("1m", new Date("2028-01-31T12:00:00.000Z"))).toBe(
      "2028-02-29T12:00:00.000Z"
    );
  });

  it("compte les jours pour la durée courte", () => {
    expect(giftExpiresAt("7d", NOW)).toBe("2026-08-11T09:30:00.000Z");
  });

  it("ne pose AUCUNE échéance pour un cadeau sans limite", () => {
    expect(giftExpiresAt("unlimited", NOW)).toBeNull();
  });

  it("donne une date à chaque durée proposée sauf « sans limite »", () => {
    // A duration added to the list without its calculation would fall here, not in prod.
    for (const duration of GIFT_DURATIONS) {
      const at = giftExpiresAt(duration, NOW);
      if (duration === "unlimited") {
        expect(at).toBeNull();
        continue;
      }
      expect(new Date(at as string).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });
});

describe("coerceGiftDuration", () => {
  it("accepte les durées connues et rejette tout le reste", () => {
    expect(coerceGiftDuration(DEFAULT_GIFT_DURATION)).toBe("1m");
    expect(coerceGiftDuration("2m")).toBeNull();
    expect(coerceGiftDuration(30)).toBeNull();
    expect(coerceGiftDuration(null)).toBeNull();
  });
});

describe("isGiftExpired", () => {
  const now = NOW.getTime();

  it("laisse vivre un cadeau sans échéance", () => {
    expect(isGiftExpired(null, now)).toBe(false);
    expect(isGiftExpired(undefined, now)).toBe(false);
  });

  it("laisse vivre un cadeau dont l'échéance est devant", () => {
    expect(isGiftExpired("2026-08-04T09:30:01.000Z", now)).toBe(false);
  });

  it("coupe à la seconde où l'échéance est atteinte", () => {
    expect(isGiftExpired("2026-08-04T09:30:00.000Z", now)).toBe(true);
    expect(isGiftExpired("2026-08-04T09:29:59.000Z", now)).toBe(true);
  });

  it("ne retire pas un droit sur une date illisible", () => {
    expect(isGiftExpired("pas une date", now)).toBe(false);
  });
});
