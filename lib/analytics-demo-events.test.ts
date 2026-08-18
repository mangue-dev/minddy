import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-150 — do the three events in the dictation demo really happen
 * until `posthog.capture` ?
 *
 * The question is not rhetorical: between the component call and PostHog, there are
 * two gates which drop to SILENCE — the runtime allowlist
 * (`ALLOWED_ANALYTICS_EVENTS`, a name missing from the `EVENT_NAMES` array is thrown)
 * and sanitization of props (everything that is not a primitive disappears).
 * The typing covers the call site, not these two: a cataloged event but
 * forgotten in `EVENT_NAMES` compiles and never leaves.
 *
 * So we inject a fake client in place of PostHog and we see what
 * reaches it. What happens AFTER `capture` is up to posthog-js.
 */

type Captured = { event: string; props: Record<string, unknown> | undefined };

async function withStubClient() {
  vi.resetModules();
  // `trackEvent` refuse de partir hors navigateur (`typeof window === "undefined"`) :
  // the suite runs in a node environment, so you have to give it one.
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
    // The content of the ticket and the dictated sentence never leave the browser.
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

    // The typical mistake: rename the event in the component and forget
    // `EVENT_NAMES`. It must not pass, and it does not pass.
    (trackEvent as (e: string, p?: unknown) => void)("landing_voice_demo_start", {
      input: "mic",
    });

    expect(captured).toEqual([]);
  });

  it("ne part pas tant que PostHog n'est pas chargé", async () => {
    vi.resetModules();
    vi.stubGlobal("window", {});
    const { trackEvent } = await import("./analytics");
    // No client filed: the call is inert, it should not be raised.
    expect(() => trackEvent("landing_voice_demo_started", { input: "mic" })).not.toThrow();
  });
});
