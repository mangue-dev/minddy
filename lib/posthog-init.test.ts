// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Root } from "react-dom/client";
import type { PostHog } from "posthog-js";

describe("PostHogInit lifecycle", () => {
  let root: Root;
  let client: PostHog | undefined;
  let captured: string[];
  let releaseImport: (() => void) | undefined;
  let delayedImport: Promise<void> | undefined;
  const nativePushState = window.history.pushState;
  const nativeReplaceState = window.history.replaceState;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    localStorage.clear();
    window.history.pushState = nativePushState;
    window.history.replaceState = nativeReplaceState;
    window.history.replaceState({}, "", "/");
    captured = [];
    client = undefined;
    releaseImport = undefined;
    delayedImport = undefined;
    vi.doMock("@/lib/runtime-config-provider", () => ({
      useRuntimeConfig: () => ({ posthog: {
        key: "phc_lifecycle_test",
        host: "https://analytics.example.test",
        allowLocalhost: true,
        errorTracking: false,
        cookieless: true,
      } }),
    }));
    vi.doMock("posthog-js", async () => {
      const actual = await vi.importActual<typeof import("posthog-js")>("posthog-js");
      client = new actual.PostHog();
      client.on("eventCaptured", (event) => captured.push(event.event));
      // Exercise the installed SDK while preventing live dependency/network loads.
      const init = client.init.bind(client);
      client.init = (key, options) => init(key, {
        ...options,
        api_transport: "fetch",
        advanced_disable_feature_flags: true,
        disable_external_dependency_loading: true,
      });
      await delayedImport;
      return { ...actual, default: client };
    });
  });

  afterEach(async () => {
    const { act } = await import("react");
    await act(async () => root?.unmount());
    if (client?.__loaded) {
      const { applyAnalyticsConsent } = await import("./analytics-consent");
      applyAnalyticsConsent(client, "declined", true);
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.doUnmock("posthog-js");
    vi.doUnmock("@/lib/runtime-config-provider");
  });

  async function mount() {
    const { act, createElement } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { PostHogInit } = await import("../components/posthog-init");
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(createElement(PostHogInit)));
    return act;
  }

  async function loadSdk(waitForInit = true) {
    const { act } = await import("react");
    await act(async () => { await vi.advanceTimersByTimeAsync(650); });
    if (waitForInit) {
      await vi.waitFor(() => expect(client?.__loaded).toBe(true));
      await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    }
  }

  it("drops queued and initial browser events when consent was declined", async () => {
    localStorage.setItem("cookie_consent", "declined");
    const analytics = await import("./analytics");
    analytics.trackEvent("landing_viewed", { locale: "en" });
    await mount();
    await loadSdk();
    expect(client?.is_capturing()).toBe(false);
    expect(captured).toEqual([]);
  });

  it("rereads a refusal recorded while the lazy SDK import is pending", async () => {
    delayedImport = new Promise<void>((resolve) => { releaseImport = resolve; });
    const act = await mount();
    await loadSdk(false);
    await vi.waitFor(() => expect(client).toBeDefined());
    const { writeConsent } = await import("./cookie-consent");
    await act(async () => writeConsent("declined"));
    await act(async () => { releaseImport?.(); await vi.advanceTimersByTimeAsync(2); });
    await vi.waitFor(() => expect(client?.__loaded).toBe(true));
    expect(client?.is_capturing()).toBe(false);
    expect(captured).toEqual([]);
  });

  it("captures one initial pageview and preserves SPA navigation after acceptance", async () => {
    localStorage.setItem("cookie_consent", "accepted");
    const act = await mount();
    await loadSdk();
    expect(captured.filter((event) => event === "$pageview")).toHaveLength(1);
    await act(async () => window.history.pushState({}, "", "/pricing"));
    expect(captured.filter((event) => event === "$pageview")).toHaveLength(2);
    const { writeConsent } = await import("./cookie-consent");
    await act(async () => writeConsent("accepted"));
    expect(captured.filter((event) => event === "$pageview")).toHaveLength(2);
  });

  it("applies hot refusal and acceptance without restarting the page", async () => {
    const act = await mount();
    await loadSdk();
    expect(client?.capture("$web_vitals")?.properties.$cookieless_mode).toBe(true);
    const { writeConsent } = await import("./cookie-consent");
    await act(async () => writeConsent("declined"));
    const before = captured.length;
    expect(client?.capture("$web_vitals")).toBeUndefined();
    await act(async () => window.history.pushState({}, "", "/pricing"));
    expect(captured).toHaveLength(before);
    await act(async () => writeConsent("accepted"));
    expect(client?.is_capturing()).toBe(true);
    expect(captured.filter((event) => event === "$pageview")).toHaveLength(2);
    expect(client?.capture("issue_created")?.properties.$cookieless_mode).not.toBe(true);
  });

  it("applies consent changes delivered from another browser tab", async () => {
    const act = await mount();
    await loadSdk();
    localStorage.setItem("cookie_consent", "declined");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "cookie_consent" })));
    expect(client?.is_capturing()).toBe(false);
    expect(client?.capture("$web_vitals")).toBeUndefined();
    localStorage.setItem("cookie_consent", "accepted");
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "cookie_consent" })));
    expect(client?.is_capturing()).toBe(true);
  });

  it("does not initialize after the component unmounts before idle", async () => {
    const act = await mount();
    await act(async () => root.unmount());
    await loadSdk(false);
    expect(client).toBeUndefined();
    expect(captured).toEqual([]);
  });

  it("honors refusal when browser preference storage is unavailable", async () => {
    const act = await mount();
    await loadSdk();
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const { writeConsent } = await import("./cookie-consent");
    await act(async () => writeConsent("declined"));
    expect(client?.capture("$web_vitals")).toBeUndefined();
    expect(client?.is_capturing()).toBe(false);
    storage.mockRestore();
  });
});
