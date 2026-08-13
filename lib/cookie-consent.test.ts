import { describe, expect, it } from "vitest";

import { resolveAnalyticsConsent } from "./cookie-consent";

/**
 * La copie du consentement portée par le COMPTE (MIN-293).
 *
 * Elle décide d'une seule chose, et c'est celle qui compte : faut-il reposer la
 * question au lancement de l'app de bureau ? Un `null` rendu à tort la repose à
 * quelqu'un qui a déjà répondu — le défaut qu'on corrigeait.
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
    // Les métadonnées de compte sont MODIFIABLES par le compte lui-même : elles
    // se lisent comme une entrée, pas comme un état de confiance.
    expect(resolveAnalyticsConsent({ analytics_consent: true })).toBeNull();
    expect(resolveAnalyticsConsent({ analytics_consent: "oui" })).toBeNull();
  });
});
