import { describe, expect, it } from "vitest";

import { resolveRegistrationState } from "./registration";

/**
 * MIN-183 — un rafraîchissement ne RALLUME pas.
 *
 * Le bug que ces cas verrouillent ne se voyait pas en essayant l'app une fois :
 * on éteint l'appareil, l'interrupteur bascule, le toast le confirme. C'est à la
 * page SUIVANTE que la remise d'aplomb au chargement (`<PushServiceWorker />`)
 * repassait par cette route et rallumait la ligne. Autrement dit :
 * l'activation/désactivation par appareil — la demande centrale du ticket — ne
 * survivait pas à une navigation.
 */
describe("resolveRegistrationState", () => {
  it("allume : une activation est là pour ça", () => {
    expect(resolveRegistrationState(null, { locale: "fr" })).toEqual({
      enabled: true,
      locale: "fr",
    });
  });

  it("rallume un appareil éteint quand c'est un geste délibéré", () => {
    expect(
      resolveRegistrationState({ enabled: false, locale: "fr" }, { locale: "fr" })
    ).toEqual({ enabled: true, locale: "fr" });
  });

  // LE cas du bug.
  it("laisse éteint ce qui était éteint quand c'est un rafraîchissement", () => {
    expect(
      resolveRegistrationState(
        { enabled: false, locale: "fr" },
        { locale: "fr", refresh: true }
      )
    ).toEqual({ enabled: false, locale: "fr" });
  });

  it("laisse allumé ce qui était allumé", () => {
    expect(
      resolveRegistrationState({ enabled: true, locale: "en" }, { refresh: true })
    ).toEqual({ enabled: true, locale: "en" });
  });

  it("naît actif quand le serveur ne connaissait pas cet abonnement", () => {
    expect(resolveRegistrationState(null, { refresh: true })).toEqual({
      enabled: true,
      locale: "en",
    });
  });

  // Le service worker n'a pas de langue à donner : il ne lit pas le cookie
  // `NEXT_LOCALE`. Sans ce report, un ré-abonnement spontané ferait passer un
  // téléphone français en anglais, sans que personne ne l'ait demandé.
  it("garde la langue de la ligne précédente quand le corps n'en porte pas", () => {
    expect(
      resolveRegistrationState({ enabled: true, locale: "fr" }, { refresh: true })
        .locale
    ).toBe("fr");
  });

  it("préfère la langue du corps quand elle est là (changement de langue)", () => {
    expect(
      resolveRegistrationState(
        { enabled: true, locale: "fr" },
        { locale: " en ", refresh: true }
      ).locale
    ).toBe("en");
  });

  it("retombe sur l'anglais quand personne n'a de langue à proposer", () => {
    expect(resolveRegistrationState({ enabled: true, locale: null }, {}).locale).toBe(
      "en"
    );
    expect(resolveRegistrationState(null, { locale: "   " }).locale).toBe("en");
  });
});
