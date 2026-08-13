import { describe, expect, it } from "vitest";

import { StripeApiError, isMissingCustomerError } from "./stripe";

/**
 * Ce qui distingue une RÉFÉRENCE PÉRIMÉE d'une panne (MIN-293).
 *
 * La première se répare — on refait un client et on rejoue — la seconde doit
 * remonter. Confondre les deux dans un sens rend un 500 sur un clic
 * « passer au plan supérieur » ; dans l'autre, ça masque une panne de Stripe
 * derrière une création de client silencieuse. D'où ce tri, testé pour lui-même.
 */
describe("isMissingCustomerError", () => {
  it("reconnaît le client disparu, tel que Stripe le renvoie", () => {
    // La forme exacte vue en local avec un `cus_…` d'un ancien compte de test.
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
    // Un price mal configuré est un défaut de NOTRE côté : refaire un client n'y
    // changerait rien, et le rejeu masquerait la vraie cause.
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
