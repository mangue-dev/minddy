import { beforeEach, describe, expect, it, vi } from "vitest";

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
