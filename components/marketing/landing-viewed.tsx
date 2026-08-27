"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useAnalytics } from "@/lib/use-analytics";
import { useTrackView } from "@/lib/use-track-view";

/**
 * First step of the acquisition funnel (MIN-78).
 *
 * Why a dedicated event rather than relying on `$pageview`:
 * - a funnel built on `$pageview` + URL break filter first
 * change of route, and also catches internal visits to `/` ;
 * - `landing_viewed` says what we measure — "someone saw the pitch" —
 * what `$pageview` on `/` does not says that indirectly.
 *
 * Since the page is a server component, this minimal client component only does
 * the emission. It is only rendered for LOGGED visitors: the page
 * redirects others to `/home` before arriving here.
 */
export function LandingViewed() {
  const locale = useLocale();
  const { setAcquisitionContext, track } = useAnalytics();
  useEffect(() => {
    setAcquisitionContext(locale, window.location.pathname);
  }, [locale, setAcquisitionContext]);
  useTrackView(true, "landing", () => track("landing_viewed", { locale }));
  return null;
}
