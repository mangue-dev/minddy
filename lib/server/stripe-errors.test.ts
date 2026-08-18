import { describe, expect, it } from "vitest";

import { StripeApiError, isMissingCustomerError } from "./stripe";

/**
 * What distinguishes an OUTDATED REFERENCE from a breakdown (MIN-293).
 *
 * The first can be repaired — we redo a client and play again — the second must
 * come back up. Confusing the two in one direction makes a 500 on one click
 * “upgrade”; in the other, it hides a Stripe
 * outage behind a silent client creation. Hence this sorting, tested for itself.
 */
describe("isMissingCustomerError", () => {
  it("reconnaît le client disparu, tel que Stripe le renvoie", () => {
    // The exact form seen locally with a `cus_…` from an old test account.
    const error = new StripeApiError(
      "No such customer: 'cus_V4EEzdira1cX7A'",
      "resource_missing",
      "customer",
      400
    );
    expect(isMissingCustomerError(error)).toBe(true);
  });

  it("le reconnaît même sans `param`", () => {
    const error = new StripeApiError(
      "No such customer: 'cus_x'",
      "resource_missing",
      null,
      400
    );
    expect(isMissingCustomerError(error)).toBe(true);
  });

  it("ne prend PAS un autre objet manquant pour un client", () => {
    // A poorly configured price is a fault on OUR side: redoing a customer does not
    // would change nothing, and replay would mask the real cause.
    const error = new StripeApiError(
      "No such price: 'price_x'",
      "resource_missing",
      "line_items[0][price]",
      400
    );
    expect(isMissingCustomerError(error)).toBe(false);
  });

  it("ne prend pas une panne pour une référence périmée", () => {
    expect(
      isMissingCustomerError(new StripeApiError("Server error", null, null, 500))
    ).toBe(false);
    expect(isMissingCustomerError(new Error("No such customer: 'cus_x'"))).toBe(false);
    expect(isMissingCustomerError(null)).toBe(false);
  });
});
