// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHog } from "posthog-js";
import { COOKIE_CONSENT_KEY, type CookieConsent } from "./cookie-consent";

describe("PostHog consent with the installed SDK", () => {
  let client: PostHog;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    for (const cookie of document.cookie.split(";")) {
      document.cookie = `${cookie.split("=")[0]}=; max-age=0; path=/`;
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  afterEach(() => {
    client?.set_config({ capture_pageview: false, cookieless_mode: undefined });
    client?.opt_out_capturing();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function start(consent: CookieConsent | null, cookieless = true) {
    if (consent) localStorage.setItem(COOKIE_CONSENT_KEY, consent);
    const { PostHog: Client } = await import("posthog-js");
    const { analyticsConsentConfig, applyAnalyticsConsent } = await import("./analytics-consent");
    const analytics = await import("./analytics");
    client = new Client();
    analytics.setAnalyticsClient(client);
    client.init("phc_consent_test", {
      api_host: "https://analytics.example.test",
      api_transport: "fetch",
      autocapture: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
      advanced_disable_feature_flags: true,
      person_profiles: "identified_only",
      ...analyticsConsentConfig(consent, cookieless),
      loaded: () => {
        applyAnalyticsConsent(client, consent, cookieless, false);
        analytics.markAnalyticsReady();
      },
    });
    await vi.advanceTimersByTimeAsync(2);
    return { applyAnalyticsConsent, analytics };
  }

  it("sends server-hashed anonymous events without a persistent analytics identifier", async () => {
    await start(null);
    const result = client.capture("$pageview");
    expect(result?.properties.$cookieless_mode).toBe(true);
    expect(client.is_capturing()).toBe(true);
    expect(document.cookie).not.toContain("ph_phc_consent_test_posthog");
    expect(localStorage.getItem("ph_phc_consent_test_posthog")).toBeNull();
  });

  it("keeps memory-only fallback when server hashing is not configured", async () => {
    await start(null, false);
    expect(client.capture("$pageview")?.properties.$cookieless_mode).not.toBe(true);
    expect(document.cookie).not.toContain("ph_phc_consent_test_posthog");
    expect(localStorage.getItem("ph_phc_consent_test_posthog")).toBeNull();
  });

  it("blocks every capture from the first load when the device declined", async () => {
    await start("declined");
    expect(client.is_capturing()).toBe(false);
    expect(client.capture("$pageview")).toBeUndefined();
    expect(client.capture("$web_vitals", { LCP: 200 })).toBeUndefined();
    expect(client.capture("issue_created")).toBeUndefined();
    expect(document.cookie).not.toContain("ph_phc_consent_test_posthog");
    expect(localStorage.getItem("ph_phc_consent_test_posthog")).toBeNull();
  });

  it("switches hashes to accepted account tracking and back to a hard refusal", async () => {
    const { applyAnalyticsConsent } = await start(null);
    const { setAnalyticsContext } = await import("./analytics-context");
    setAnalyticsContext("identity", () => client.identify("account-a", { name: "Ada" }));
    setAnalyticsContext("group:project", () => client.group("project", "project-a"));
    expect(client.get_distinct_id()).not.toBe("account-a");

    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    applyAnalyticsConsent(client, "accepted", true);
    expect(client.is_capturing()).toBe(true);
    expect(client.get_distinct_id()).toBe("account-a");
    const accepted = client.capture("$pageview");
    expect(accepted?.properties.$cookieless_mode).not.toBe(true);
    expect(accepted?.properties.$groups).toEqual({ project: "project-a" });
    expect(document.cookie).toContain("ph_phc_consent_test_posthog");

    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    applyAnalyticsConsent(client, "declined", true);
    expect(client.is_capturing()).toBe(false);
    expect(client.capture("$pageview")).toBeUndefined();
    expect(client.capture("$web_vitals")).toBeUndefined();
    expect(document.cookie).not.toContain("ph_phc_consent_test_posthog");
    expect(localStorage.getItem("ph_phc_consent_test_posthog")).toBeNull();

    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    applyAnalyticsConsent(client, "accepted", true);
    expect(client.get_distinct_id()).toBe("account-a");
    expect(client.capture("issue_created")).toBeDefined();
  });

  it("forgets pending account identity when the user signs out before consenting", async () => {
    await start(null);
    const { setAnalyticsContext, resetAnalyticsContext } = await import("./analytics-context");
    setAnalyticsContext("identity", () => client.identify("previous-account"));
    setAnalyticsContext("group:project", () => client.group("project", "previous-project"));
    resetAnalyticsContext();
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    const { applyAnalyticsConsent } = await import("./analytics-consent");
    applyAnalyticsConsent(client, "accepted", true);
    expect(client.get_distinct_id()).not.toBe("previous-account");
    expect(client.capture("$pageview")?.properties.$groups ?? {}).toEqual({});
  });

  it.each([false, true])("returns to anonymous measurement when acceptance is cleared (hashing %s)", async (cookieless) => {
    const { applyAnalyticsConsent } = await start("accepted", cookieless);
    client.identify("previous-account");
    client.group("project", "previous-project");
    client.register({ project_id: "previous-project" });
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    applyAnalyticsConsent(client, null, cookieless);
    const event = client.capture("$pageview");
    expect(event).toBeDefined();
    expect(event?.properties.distinct_id).not.toBe("previous-account");
    expect(event?.properties.$groups ?? {}).toEqual({});
    expect(event?.properties.project_id).toBeUndefined();
    expect(document.cookie).not.toContain("ph_phc_consent_test_posthog");
    expect(localStorage.getItem("ph_phc_consent_test_posthog")).toBeNull();
  });

  it("honors a newly recorded refusal even before its listener runs", async () => {
    await start(null);
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    expect(client.capture("$pageview")).toBeUndefined();
    expect(client.capture("$web_vitals")).toBeUndefined();
  });

  it("removes page titles and sensitive URL queries while retaining route and campaign metrics", async () => {
    await start(null);
    const result = client.capture("$pageview", {
      $title: "Private issue title",
      $current_url: "https://minddy.app/auth/callback?code=private-code#private-token",
      $referrer: "https://example.test/?email=private-address",
      utm_source: "newsletter",
    });
    expect(result?.properties.$title).toBeUndefined();
    expect(result?.properties.$current_url).toBe("https://minddy.app/auth/callback");
    expect(result?.properties.$referrer).toBe("https://example.test/");
    expect(result?.properties.utm_source).toBe("newsletter");
  });
});
