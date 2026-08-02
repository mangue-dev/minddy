import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * File d'attente de l'init différée (MIN-78).
 *
 * Régression réelle : PostHog s'initialise dans `requestIdleCallback` (jusqu'à
 * 800 ms) alors que Supabase émet `INITIAL_SESSION` dès le montage. `identify()`
 * partait donc sur un client non initialisé et se perdait — l'utilisateur
 * restait anonyme toute la session et aucun entonnoir par compte n'était
 * calculable. Ces tests verrouillent le rejeu.
 */

// Le module garde un état de module (drapeau + file) : il faut le réimporter
// à neuf entre les tests, d'où l'import dynamique après `resetModules`.
async function freshModule() {
  vi.resetModules();
  return import("./analytics");
}

describe("onAnalyticsReady", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("diffère le callback tant que PostHog n'est pas prêt", async () => {
    const { onAnalyticsReady, markAnalyticsReady } = await freshModule();
    const cb = vi.fn();

    onAnalyticsReady(cb);
    expect(cb).not.toHaveBeenCalled();

    markAnalyticsReady();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("exécute immédiatement si PostHog est déjà prêt", async () => {
    const { onAnalyticsReady, markAnalyticsReady } = await freshModule();
    markAnalyticsReady();

    const cb = vi.fn();
    onAnalyticsReady(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("rejoue les callbacks dans l'ordre d'enregistrement", async () => {
    const { onAnalyticsReady, markAnalyticsReady } = await freshModule();
    const order: string[] = [];

    onAnalyticsReady(() => order.push("identify"));
    onAnalyticsReady(() => order.push("group"));
    markAnalyticsReady();

    expect(order).toEqual(["identify", "group"]);
  });

  it("ne rejoue jamais deux fois le même callback", async () => {
    const { onAnalyticsReady, markAnalyticsReady } = await freshModule();
    const cb = vi.fn();

    onAnalyticsReady(cb);
    markAnalyticsReady();
    markAnalyticsReady(); // second appel (remontage de PostHogInit)

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("l'annulation empêche le rejeu (composant démonté avant l'init)", async () => {
    const { onAnalyticsReady, markAnalyticsReady } = await freshModule();
    const cb = vi.fn();

    const cancel = onAnalyticsReady(cb);
    cancel();
    markAnalyticsReady();

    expect(cb).not.toHaveBeenCalled();
  });

  it("tolère qu'un callback en enregistre un autre pendant le drainage", async () => {
    const { onAnalyticsReady, markAnalyticsReady } = await freshModule();
    const nested = vi.fn();

    onAnalyticsReady(() => onAnalyticsReady(nested));
    markAnalyticsReady();

    // Le second s'exécute tout de suite : le drapeau est déjà levé.
    expect(nested).toHaveBeenCalledTimes(1);
  });
});

/**
 * MIN-150 — la file d'attente des ÉVÉNEMENTS.
 *
 * Régression réelle, et invisible : `landing_viewed` est émis au montage de
 * chaque visite de la landing, et PostHog n'en avait pas reçu UN SEUL en
 * 180 jours, quand les événements de clic de la même page arrivaient bien. Un
 * effet de montage passe toujours avant le `requestIdleCallback` de l'init ;
 * les jeter revenait donc à ne jamais mesurer aucun « vu ».
 */
describe("file d'attente des événements", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Un faux client PostHog qui note ce qu'on lui capture. */
  function stubClient() {
    const calls: { event: string; props: unknown; options?: { timestamp?: Date } }[] = [];
    return {
      calls,
      client: {
        __loaded: true,
        capture: (event: string, props: unknown, options?: { timestamp?: Date }) =>
          calls.push({ event, props, options }),
      } as never,
    };
  }

  it("rejoue à l'init un événement émis avant elle", async () => {
    const mod = await freshModule();
    const { calls, client } = stubClient();

    mod.trackEvent("landing_viewed", {});
    expect(calls).toHaveLength(0); // pas de client : rien ne part encore

    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();

    expect(calls.map((c) => c.event)).toEqual(["landing_viewed"]);
  });

  it("rejoue avec l'heure d'ÉMISSION, pas celle du rejeu", async () => {
    const mod = await freshModule();
    const { calls, client } = stubClient();

    const before = new Date();
    mod.trackEvent("landing_viewed", {});
    const after = new Date();

    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();

    const stamped = calls[0].options?.timestamp;
    expect(stamped).toBeInstanceOf(Date);
    expect(stamped!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(stamped!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("garde l'ordre d'émission, et ne rejoue qu'une fois", async () => {
    const mod = await freshModule();
    const { calls, client } = stubClient();

    mod.trackEvent("landing_viewed", {});
    mod.trackEvent("landing_cta_clicked", { location: "hero" });

    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();
    mod.markAnalyticsReady(); // remontage de PostHogInit

    expect(calls.map((c) => c.event)).toEqual(["landing_viewed", "landing_cta_clicked"]);
  });

  it("part directement une fois l'init passée, sans horodatage rejoué", async () => {
    const mod = await freshModule();
    const { calls, client } = stubClient();

    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();
    mod.trackEvent("landing_cta_clicked", { location: "hero" });

    expect(calls).toHaveLength(1);
    expect(calls[0].options).toBeUndefined();
  });

  it("borne la file : un onglet sans PostHog n'accumule pas sans fin", async () => {
    const mod = await freshModule();
    const { calls, client } = stubClient();

    for (let i = 0; i < 50; i++) mod.trackEvent("landing_viewed", {});

    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();

    expect(calls).toHaveLength(20);
  });

  it("vide la file sans rien envoyer quand PostHog ne s'initialise pas", async () => {
    const mod = await freshModule();

    mod.trackEvent("landing_viewed", {});
    // Pas de client déposé : c'est le cas « pas de clé » / « hôte local », où
    // `PostHogInit` appelle quand même `markAnalyticsReady`.
    expect(() => mod.markAnalyticsReady()).not.toThrow();

    // Et la file est bien vidée : un client déposé plus tard ne reçoit rien.
    const { calls, client } = stubClient();
    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();
    expect(calls).toHaveLength(0);
  });

  it("l'identité est rejouée AVANT les événements en attente", async () => {
    const mod = await freshModule();
    const order: string[] = [];
    mod.trackEvent("landing_viewed", {});
    mod.onAnalyticsReady(() => order.push("identify"));
    mod.setAnalyticsClient({
      __loaded: true,
      capture: () => order.push("capture"),
    } as never);

    mod.markAnalyticsReady();

    expect(order).toEqual(["identify", "capture"]);
  });
});
