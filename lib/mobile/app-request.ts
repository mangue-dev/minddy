/**
 * Requests from the minddy mobile app (MIN-907). The iOS shell appends
 * `minddy-mobile/<version>` to the WebView's user agent
 * (mobile/ios/App/App/MinddyViewController.swift).
 */
const MOBILE_APP_AGENT = /\bminddy-mobile\//;

export function isMobileAppUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && MOBILE_APP_AGENT.test(userAgent);
}

/**
 * Public pages the app still shows: the legal texts, which the stores require
 * to stay reachable. The documentation is served before this check.
 */
const KEPT_IN_APP = new Set(["legal", "terms", "privacy", "cookies"]);

/**
 * Whether a public page of `lib/public-routes.ts` is part of the marketing
 * site, which the app never shows: it sends the reader to their work instead.
 */
export function isMarketingRouteKey(key: string | undefined): boolean {
  return !!key && !KEPT_IN_APP.has(key) && key !== "documentation";
}
