import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Delayed init queue (MIN-78).
 *
 * Actual regression: PostHog initializes in `requestIdleCallback` (until
 * 800 ms) while Supabase issues `INITIAL_SESSION` as soon as assembly. `identify()`
 * therefore left on an uninitialized client and got lost — the user
 * remained anonymous throughout the session and no funnel per account was
 * calculable. These tests lock replay.
 */

// The module keeps a module state (flag + file): it must be re-imported
// to new between tests, hence the dynamic import after `resetModules`.
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

    // The second executes immediately: the flag is already raised.
    expect(nested).toHaveBeenCalledTimes(1);
  });
});

/**
 * MIN-150 — the EVENT queue.
 *
 * Real, invisible regression: `landing_viewed` is emitted when mounting
 * every visit to the landing, and PostHog had not received ONE SINGLE one en
 * 180 days, when click events on the same page were arriving successfully. A
 * mounting effect always comes before the `requestIdleCallback` of the init;
 * throwing them away therefore meant never measuring any "seen".
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

    mod.trackEvent("landing_viewed", { locale: "en" });
    expect(calls).toHaveLength(0); // pas de client : rien ne part encore

    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();

    expect(calls.map((c) => c.event)).toEqual(["landing_viewed"]);
  });

  it("rejoue avec l'heure d'ÉMISSION, pas celle du rejeu", async () => {
    const mod = await freshModule();
    const { calls, client } = stubClient();

    const before = new Date();
    mod.trackEvent("landing_viewed", { locale: "en" });
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

    mod.trackEvent("landing_viewed", { locale: "en" });
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

    for (let i = 0; i < 50; i++) mod.trackEvent("landing_viewed", { locale: "en" });

    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();

    expect(calls).toHaveLength(20);
  });

  it("vide la file sans rien envoyer quand PostHog ne s'initialise pas", async () => {
    const mod = await freshModule();

    mod.trackEvent("landing_viewed", { locale: "en" });
    // No client filed: this is the case “no key” / “local host”, where
    // `PostHogInit` still calls `markAnalyticsReady`.
    expect(() => mod.markAnalyticsReady()).not.toThrow();

    // And the queue is completely empty: a customer who drops off later receives nothing.
    const { calls, client } = stubClient();
    mod.setAnalyticsClient(client);
    mod.markAnalyticsReady();
    expect(calls).toHaveLength(0);
  });

  it("l'identité est rejouée AVANT les événements en attente", async () => {
    const mod = await freshModule();
    const order: string[] = [];
    mod.trackEvent("landing_viewed", { locale: "en" });
    mod.onAnalyticsReady(() => order.push("identify"));
    mod.setAnalyticsClient({
      __loaded: true,
      capture: () => order.push("capture"),
    } as never);

    mod.markAnalyticsReady();

    expect(order).toEqual(["identify", "capture"]);
  });
});
