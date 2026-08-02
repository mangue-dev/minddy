import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-150 — les trois événements de la démo de dictée arrivent-ils vraiment
 * jusqu'à `posthog.capture` ?
 *
 * La question n'est pas rhétorique : entre l'appel du composant et PostHog, il y
 * a deux portes qui laissent tomber en SILENCE — l'allowlist runtime
 * (`ALLOWED_ANALYTICS_EVENTS`, un nom absent du tableau `EVENT_NAMES` est jeté)
 * et la sanitisation des props (tout ce qui n'est pas une primitive disparaît).
 * Le typage couvre le call site, pas ces deux-là : un événement catalogué mais
 * oublié dans `EVENT_NAMES` compile et ne part jamais.
 *
 * On injecte donc un faux client à la place de PostHog et on regarde ce qui
 * l'atteint. Ce qui se passe APRÈS `capture` appartient à posthog-js.
 */

type Captured = { event: string; props: Record<string, unknown> | undefined };

async function withStubClient() {
  vi.resetModules();
  // `trackEvent` refuse de partir hors navigateur (`typeof window === "undefined"`) :
  // la suite tourne en environnement node, il faut donc lui en donner un.
  vi.stubGlobal("window", {});
  const mod = await import("./analytics");
  const captured: Captured[] = [];
  mod.setAnalyticsClient({
    __loaded: true,
    capture: (event: string, props?: Record<string, unknown>) =>
      captured.push({ event, props }),
  } as never);
  return { ...mod, captured };
}

describe("les événements de la démo de dictée atteignent PostHog", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("émet le départ, avec la provenance de la prise", async () => {
    const { trackEvent, captured } = await withStubClient();

    trackEvent("landing_voice_demo_started", { input: "mic" });
    trackEvent("landing_voice_demo_started", { input: "sample" });

    expect(captured).toEqual([
      { event: "landing_voice_demo_started", props: { input: "mic" } },
      { event: "landing_voice_demo_started", props: { input: "sample" } },
    ]);
  });

  it("émet la réussite avec la tranche d'attente, jamais le texte dicté", async () => {
    const { trackEvent, captured } = await withStubClient();

    trackEvent("landing_voice_demo_completed", {
      input: "sample",
      duration_bucket: "1_5s",
    });

    expect(captured[0].event).toBe("landing_voice_demo_completed");
    expect(captured[0].props).toEqual({ input: "sample", duration_bucket: "1_5s" });
    // Le contenu du ticket et la phrase dictée ne quittent jamais le navigateur.
    expect(JSON.stringify(captured[0].props)).not.toMatch(/Stripe|Léa/);
  });

  it("émet l'échec avec un motif STABLE, pas un message d'erreur", async () => {
    const { trackEvent, captured } = await withStubClient();

    for (const reason of ["rate_limited", "empty", "denied", "unsupported", "http_502"]) {
      trackEvent("landing_voice_demo_failed", { input: "mic", reason });
    }

    expect(captured.map((c) => c.props?.reason)).toEqual([
      "rate_limited",
      "empty",
      "denied",
      "unsupported",
      "http_502",
    ]);
  });

  it("jette un nom voisin mais absent du catalogue", async () => {
    const { trackEvent, captured } = await withStubClient();

    // La faute typique : renommer l'événement dans le composant et oublier
    // `EVENT_NAMES`. Elle ne doit pas passer, et elle ne passe pas.
    (trackEvent as (e: string, p?: unknown) => void)("landing_voice_demo_start", {
      input: "mic",
    });

    expect(captured).toEqual([]);
  });

  it("ne part pas tant que PostHog n'est pas chargé", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {});
    const { trackEvent } = await import("./analytics");
    // Aucun client déposé : l'appel est inerte, il ne doit pas lever.
    expect(() => trackEvent("landing_voice_demo_started", { input: "mic" })).not.toThrow();
  });
});
