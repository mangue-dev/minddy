import { describe, expect, it } from "vitest";

import { urlBase64ToUint8Array, usesOurApplicationServerKey } from "./client";

/**
 * MIN-183 — l'abonnement en place porte-t-il bien NOTRE clé publique ?
 *
 * Le cas qui a motivé ce test s'est produit en vrai, dès le premier essai. Sur
 * `http://localhost:3000`, l'origine est PARTAGÉE entre tous les projets de la
 * machine : Chrome portait un abonnement laissé par un autre projet, permission
 * comprise. Il a été ramassé et enregistré comme un appareil de minddy, la carte
 * l'affichait comme actif — et chaque envoi repartait en 403, avec ce message de
 * FCM : « the VAPID credentials in the authorization header do not correspond to
 * the credentials used to create the subscriptions ». Rien, côté navigateur, ne
 * distingue cet abonnement d'un bon.
 *
 * Le même piège attend la production, une fois seulement : le jour d'une
 * rotation de la paire VAPID.
 */

const OURS =
  "BG7H87PkIzrEUdTWI4QhIs2__h6tx10yL3ooWJkdI5vHx3Wry42yshEKJQo5DqE2_Xu8JaZn8LJdbIyEPxDe710";
const SOMEONE_ELSE =
  "BJlZmGmYUQjB7l1V1sJ0iBWs5xKHWU9NSPoO0Xo6vNSQqYzO7CkJHXKtvXCVvSCDcnQEsqR1F6nZ6yPmvKAGxxQ";

/** Un abonnement réduit à ce que la comparaison regarde. */
const subscriptionWith = (key: string | null | undefined) =>
  ({
    options:
      key === undefined
        ? undefined
        : {
            userVisibleOnly: true,
            applicationServerKey: key
              ? (urlBase64ToUint8Array(key).buffer as ArrayBuffer)
              : null,
          },
  }) as unknown as Pick<PushSubscription, "options">;

describe("urlBase64ToUint8Array", () => {
  it("décode une clé VAPID en 65 octets, point non compressé (0x04)", () => {
    const bytes = urlBase64ToUint8Array(OURS);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("traduit l'alphabet base64url avant de décoder", () => {
    // « a-b_ » en base64url, c'est « a+b/ » en base64 standard. Sans la
    // traduction, `atob` lèverait sur le tiret.
    expect([...urlBase64ToUint8Array("a-b_")]).toEqual([
      ...new Uint8Array(Buffer.from("a+b/", "base64")),
    ]);
  });

  it("remet le remplissage que le base64url laisse tomber", () => {
    // Les clés VAPID font 87 caractères, soit un reste de 3 : sans le `=`
    // rajouté, le dernier octet manquerait à l'appel.
    expect(OURS.length % 4).toBe(3);
    expect(urlBase64ToUint8Array(OURS)).toHaveLength(65);
    // Reste de 2, l'autre longueur de remplissage possible.
    expect(urlBase64ToUint8Array("a-b_cd")).toHaveLength(4);
  });
});

describe("usesOurApplicationServerKey", () => {
  it("reconnaît notre clé", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(OURS), OURS)).toBe(true);
  });

  // LE cas du bug : un abonnement parfaitement valide, mais scellé ailleurs.
  it("refuse la clé d'un autre — c'est le 403 qu'on ne voit jamais venir", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(SOMEONE_ELSE), OURS)).toBe(
      false
    );
  });

  it("refuse un abonnement sans clé applicative", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(null), OURS)).toBe(false);
  });

  /**
   * Le repli est ASYMÉTRIQUE, et c'est délibéré : un navigateur qui n'expose pas
   * `options` ne permet pas de trancher. Répondre `true` coûte au pire un 403 de
   * temps en temps ; répondre `false` ferait se désabonner et se réabonner TOUT
   * LE MONDE à chaque chargement de page.
   */
  it("laisse passer quand le navigateur n'expose pas `options`", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(undefined), OURS)).toBe(true);
  });
});
