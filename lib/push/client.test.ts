import { describe, expect, it } from "vitest";

import { urlBase64ToUint8Array, usesOurApplicationServerKey } from "./client";

/**
 * MIN-183 — does the existing subscription carry OUR public key?
 *
 * The case which motivated this test actually occurred, from the first try. On
 * `http://localhost:3000`, the origin is SHARED between all projects on the
 * machine: Chrome carried a subscription left by another project, permission
 * included. It was picked up and registered as a minddy device, the card
 * showed it as active — and each sending went back to 403, with this message from
 * FCM: “the VAPID credentials in the authorization header do not correspond to
 * the credentials used to create the subscriptions”. Nothing, on the browser side,
 * distinguishes this subscription from a good one.
 *
 * The same trap awaits production, only once: on the day of a
 * rotation of the VAPID pair.
 */

const OURS =
  "BG7H87PkIzrEUdTWI4QhIs2__h6tx10yL3ooWJkdI5vHx3Wry42yshEKJQo5DqE2_Xu8JaZn8LJdbIyEPxDe710";
const SOMEONE_ELSE =
  "BJlZmGmYUQjB7l1V1sJ0iBWs5xKHWU9NSPoO0Xo6vNSQqYzO7CkJHXKtvXCVvSCDcnQEsqR1F6nZ6yPmvKAGxxQ";

/** A reduced subscription to what the comparison is looking at. */
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
  it("decodes a VAPID key into 65 bytes, uncompressed point (0x04)", () => {
    const bytes = urlBase64ToUint8Array(OURS);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("traduit l'alphabet base64url avant de décoder", () => {
    // “a-b_” in base64url is “a+b/” in standard base64. Without the
    // translation, `atob` would raise on the dash.
    expect([...urlBase64ToUint8Array("a-b_")]).toEqual([
      ...new Uint8Array(Buffer.from("a+b/", "base64")),
    ]);
  });

  it("remet le remplissage que le base64url laisse tomber", () => {
    // VAPID keys are 87 characters long, or a remainder of 3: without the `=`
    // added, the last byte would be missing in the call.
    expect(OURS.length % 4).toBe(3);
    expect(urlBase64ToUint8Array(OURS)).toHaveLength(65);
    // Reste de 2, l'autre longueur de remplissage possible.
    expect(urlBase64ToUint8Array("a-b_cd")).toHaveLength(4);
  });
});

describe("usesOurApplicationServerKey", () => {
  it("recognizes our key", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(OURS), OURS)).toBe(true);
  });

  // THE case of the bug: a perfectly valid subscription, but sealed elsewhere.
  it("rejects another key — this is the 403 we never see coming", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(SOMEONE_ELSE), OURS)).toBe(
      false
    );
  });

  it("rejects a subscription without an application key", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(null), OURS)).toBe(false);
  });

  /**
 * The fallback is ASYMMETRICAL, and this is deliberate: a browser that does not expose
 * `options` does not allow a decision. Answer `true` costs at worst a 403 of
 * from time to time; answering `false` would make EVERYTHING
 * unsubscribe and resubscribe on every page load.
 */
  it("laisse passer quand le navigateur n'expose pas `options`", () => {
    expect(usesOurApplicationServerKey(subscriptionWith(undefined), OURS)).toBe(true);
  });
});
