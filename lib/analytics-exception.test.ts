import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-542 — does a client-side error boundary report reach PostHog?
 *
 * Two paths must be covered: a client already loaded (`captureException`
 * directly) and one still initializing (queued, then replayed by
 * `markAnalyticsReady`, exactly like the event queue of MIN-150).
 */

async function importAnalytics() {
  vi.resetModules();
  // `captureClientException` refuses to run outside a browser
  // (`typeof window === "undefined"`): the suite runs in node, so provide one.
  vi.stubGlobal("window", {});
  return import("./analytics");
}

describe("captureClientException", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports through the loaded client", async () => {
    const mod = await importAnalytics();
    const captured: unknown[] = [];
    mod.setAnalyticsClient({ __loaded: true, captureException: (e: unknown) => captured.push(e) } as never);

    const error = new Error("boundary");
    mod.captureClientException(error);

    expect(captured).toEqual([error]);
  });

  it("queues an exception thrown before init and replays it once ready", async () => {
    const mod = await importAnalytics();
    const error = new Error("too early");
    mod.captureClientException(error);

    const captured: unknown[] = [];
    mod.setAnalyticsClient({ __loaded: true, captureException: (e: unknown) => captured.push(e) } as never);
    mod.markAnalyticsReady();

    expect(captured).toEqual([error]);
  });

  it("empties the queue without a client: analytics off is silent", async () => {
    const mod = await importAnalytics();
    mod.captureClientException(new Error("dropped"));
    mod.markAnalyticsReady();
    mod.setAnalyticsClient({ __loaded: true, captureException: () => {} } as never);
    // Nothing was recorded for a later replay — the mark already happened.
    const captured: unknown[] = [];
    mod.setAnalyticsClient({ __loaded: true, captureException: (e: unknown) => captured.push(e) } as never);

    expect(captured).toEqual([]);
  });

  it("keeps the queue bounded: an error page never throws a flood", async () => {
    const mod = await importAnalytics();
    for (let index = 0; index < 50; index += 1) {
      mod.captureClientException(new Error(`number ${index}`));
    }

    const captured: unknown[] = [];
    mod.setAnalyticsClient({ __loaded: true, captureException: (e: unknown) => captured.push(e) } as never);
    mod.markAnalyticsReady();

    expect(captured).toHaveLength(5);
  });
});
