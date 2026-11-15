import { describe, expect, it } from "vitest";

import { billingReturnUrl } from "./return-url";
import { DESKTOP_RETURN_PATH } from "./config";

/**
 * From the desktop app, a third-party page must return to the bounce page,
 * which reopens the app: returning straight to the app's URL would leave the
 * person in their browser, signed in to a window they did not open.
 */
describe("billingReturnUrl", () => {
  it("depuis le web, renvoie sur la page elle-même", () => {
    expect(billingReturnUrl("https://minddy.app", "/settings/billing", false)).toBe(
      "https://minddy.app/settings/billing",
    );
  });

  it("depuis l'app de bureau, passe par le rebond, avec la destination encodée", () => {
    expect(billingReturnUrl("https://minddy.app", "/settings/billing?tab=plan", true)).toBe(
      `https://minddy.app${DESKTOP_RETURN_PATH}?next=${encodeURIComponent("/settings/billing?tab=plan")}`,
    );
  });
});
