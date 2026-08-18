import { describe, expect, it } from "vitest";

import { billingReturnUrl } from "./return-url";
import { DESKTOP_RETURN_PATH } from "./config";

/**
 * MIN-362 — the `<module>.ts` / `<module>.test.ts` boss of `lib/desktop/`, held
 * until the end (cf. [local-surface-coverage.test.ts](../server/agent/local-surface-coverage.test.ts)).
 *
 * What is kept here is not the concatenation, it is the RETURN PATH:
 * from the desktop app, a third party URL should return to the page of bounce,
 * which reopens the app — returning directly to it would leave the user in their
 * browser, their session ended in a window they did not open.
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
