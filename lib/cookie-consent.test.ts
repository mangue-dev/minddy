import { describe, expect, it } from "vitest";

import { resolveAnalyticsConsent } from "./cookie-consent";

/**
 * The copy of the consent carried by the ACCOUNT (MIN-293).
 *
 * It decides only one thing, and that's the one that counts: should we ask the
 * question when launching the desktop app? An incorrectly returned `null` returns it to
 * someone who has already responded — the defect we were correcting.
 */
describe("resolveAnalyticsConsent", () => {
  it("rend le choix du compte", () => {
    expect(resolveAnalyticsConsent({ analytics_consent: "accepted" })).toBe("accepted");
    expect(resolveAnalyticsConsent({ analytics_consent: "declined" })).toBe("declined");
  });

  it("rend null sur un compte qui n'a jamais répondu", () => {
    expect(resolveAnalyticsConsent({})).toBeNull();
    expect(resolveAnalyticsConsent(undefined)).toBeNull();
    expect(resolveAnalyticsConsent(null)).toBeNull();
  });

  it("rend null sur une valeur qui n'est pas une réponse", () => {
    // Account metadata can be MODIFIED by the account itself: they
    // read like an input, not a trust state.
    expect(resolveAnalyticsConsent({ analytics_consent: true })).toBeNull();
    expect(resolveAnalyticsConsent({ analytics_consent: "oui" })).toBeNull();
  });
});
