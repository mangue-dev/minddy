import type { PostHog, PostHogConfig } from "posthog-js";
import { replayAnalyticsContext } from "./analytics-context";
import { readConsent, type CookieConsent } from "./cookie-consent";

/** Start with pageviews disabled until the device choice has been applied. */
export function analyticsConsentConfig(
  consent: CookieConsent | null,
  cookieless: boolean,
): Partial<PostHogConfig> {
  return {
    capture_pageview: false,
    cookieless_mode: consent === null && cookieless ? "on_reject" : undefined,
    opt_out_capturing_by_default: consent === "declined" || (consent === null && cookieless),
    opt_out_persistence_by_default: true,
    disable_persistence: consent !== "accepted",
    persistence: consent === "accepted" ? "localStorage+cookie" : "memory",
    before_send: (event) => {
      if (!event || readConsent() === "declined") return null;
      const properties = { ...event.properties };
      // Document titles and auth/query fragments can contain private app data.
      delete properties.$title;
      for (const key of ["$current_url", "$initial_current_url", "$referrer", "$initial_referrer"]) {
        if (typeof properties[key] !== "string") continue;
        try {
          const url = new URL(properties[key]);
          properties[key] = url.origin + url.pathname;
        } catch {
          delete properties[key];
        }
      }
      return { ...event, properties };
    },
  };
}

/** Never let the SDK's cookieless-on-rejection mode reinterpret a hard refusal. */
export function applyAnalyticsConsent(
  client: PostHog,
  consent: CookieConsent | null,
  cookieless: boolean,
  replayContext = true,
): void {
  client.set_config({ capture_pageview: false });
  if (consent === "accepted") {
    // Keep on_reject until opt-in so the SDK rebuilds session state after hashes.
    client.set_config({ persistence: "localStorage+cookie", disable_persistence: false });
    client.opt_in_capturing({ captureEventName: false });
    // posthog-js 1.434.13 ignores undefined values in set_config. Clear this
    // public config field before refreshing extensions/persistence below.
    client.config.cookieless_mode = undefined;
    client.set_config({ cookieless_mode: undefined, opt_out_capturing_by_default: false });
    if (replayContext) replayAnalyticsContext();
  } else {
    if (consent === "declined" || !cookieless) client.config.cookieless_mode = undefined;
    client.set_config(analyticsConsentConfig(consent, cookieless));
    if (consent === "declined") {
      client.opt_out_capturing();
      client.reset(true);
    } else {
      // Minddy's saved choice is authoritative over a stale SDK opt-in/out marker.
      client.clear_opt_in_out_capturing();
      // Clearing the preference returns to anonymous measurement, including
      // the memory-only fallback; discard any previously accepted SDK context.
      client.reset(true);
    }
  }
  if (consent !== "declined") client.set_config({ capture_pageview: "history_change" });
}
