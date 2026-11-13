import { describe, expect, it } from "vitest";

import { parsePushRegistration, resolveRegistrationState } from "./registration";

describe("parsePushRegistration", () => {
  it("accepte un abonnement Web Push complet", () => {
    expect(
      parsePushRegistration({
        endpoint: "https://push.example/device",
        keys: { p256dh: "public", auth: "secret" },
      })
    ).toEqual({
      endpoint: "https://push.example/device",
      transport: "web",
      p256dh: "public",
      auth: "secret",
      installationId: null,
      apnsPlatform: null,
      apnsEnvironment: null,
    });
  });

  it("accepte un token APNs hexadécimal sans clés Web Push", () => {
    const endpoint = `apns:${"ab".repeat(32)}`;
    const installationId = "11111111-1111-4111-8111-111111111111";
    expect(parsePushRegistration({ transport: "apns", endpoint, installationId })).toEqual({
      endpoint,
      transport: "apns",
      p256dh: null,
      auth: null,
      installationId,
      apnsPlatform: null,
      apnsEnvironment: null,
    });
  });

  it("records the app and the gateway an APNs token belongs to", () => {
    const endpoint = `apns:${"ab".repeat(32)}`;
    const installationId = "11111111-1111-4111-8111-111111111111";
    expect(
      parsePushRegistration({ transport: "apns", endpoint, installationId, platform: "ios", environment: "sandbox" }),
    ).toMatchObject({ apnsPlatform: "ios", apnsEnvironment: "sandbox" });
  });

  it("refuses an APNs token with half a target or an unknown one", () => {
    const endpoint = `apns:${"ab".repeat(32)}`;
    const installationId = "11111111-1111-4111-8111-111111111111";
    // Sent to the wrong gateway, a token comes back "BadDeviceToken" and the
    // device is deleted: better refuse it at registration.
    expect(parsePushRegistration({ transport: "apns", endpoint, installationId, platform: "ios" })).toBeNull();
    expect(parsePushRegistration({ transport: "apns", endpoint, installationId, environment: "sandbox" })).toBeNull();
    expect(
      parsePushRegistration({ transport: "apns", endpoint, installationId, platform: "android", environment: "production" }),
    ).toBeNull();
    expect(
      parsePushRegistration({ transport: "apns", endpoint, installationId, platform: "ios", environment: "staging" }),
    ).toBeNull();
  });

  it("refuse de faire passer une URL ou un token arbitraire pour APNs", () => {
    expect(parsePushRegistration({ transport: "apns", endpoint: "https://x" })).toBeNull();
    expect(parsePushRegistration({ transport: "apns", endpoint: "apns:not-hex" })).toBeNull();
  });

  it("accepts only Microsoft HTTPS channel URIs for WNS", () => {
    const installationId = "11111111-1111-4111-8111-111111111111";
    const endpoint = "https://wns2-by3p.notify.windows.com/?token=channel";
    expect(parsePushRegistration({ transport: "wns", endpoint, installationId })).toEqual({
      endpoint,
      transport: "wns",
      p256dh: null,
      auth: null,
      installationId,
      apnsPlatform: null,
      apnsEnvironment: null,
    });
    expect(
      parsePushRegistration({
        transport: "wns",
        endpoint: "https://notify.windows.com.attacker.example/channel",
        installationId,
      }),
    ).toBeNull();
    expect(
      parsePushRegistration({
        transport: "wns",
        endpoint: "http://notify.windows.com/channel",
        installationId,
      }),
    ).toBeNull();
  });
});

/**
 * MIN-183 — a refresh does not TURN ON.
 *
 * The bug that these cases lock was not visible when trying the app once:
 * we turn off the device, the switch flips, the toast confirms it. It was on the
 * NEXT page that the loading re-alignment (`<PushServiceWorker />`)
 * returned via this route and re-ignited the line. In other words:
 * activation/deactivation by device — the central request of the ticket — does not
 * survive a navigation.
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

  // THE case of the bug.
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

  // The service worker has no language to give: it does not read the cookie
  // `NEXT_LOCALE`. Without this postponement, a spontaneous re-subscription would result in a
  // French telephone in English, without anyone asking.
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
