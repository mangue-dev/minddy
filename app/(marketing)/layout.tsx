import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { DesktopMarketingRedirect } from "@/components/desktop-marketing-redirect";
import { AcquisitionContext } from "@/components/marketing/acquisition-context";
import { resolveCapabilities } from "@/lib/capabilities";

/**
 * Public site (MIN-73): landing and prices. Chrome shared with pages
 * legal, which render the same two components from their own layout.
 * `pt-20` compensates for the navigation badge, placed in sticky form above the flow.
 *
 * `Analytics` and `SpeedInsights` live HERE, not at the root layout (MIN-323).
 *
 * They install `PerformanceObserver` and a navigation listener on everything
 * what they cover. In the root layout, they were running in the authenticated app —
 * who does not use it: their audience measurement goes through PostHog, and their screens
 * are not public pages for which Web Vital is optimized.
 *
 * Assumed compensation: no more Vercel pageviews on the connected app. It is
 * exactly what we were looking for — the measurement follows public pages.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const webAnalytics = resolveCapabilities(process.env).vercelWebAnalytics.configured;
  return (
    // `relative isolate`: container block AND stacking context for
    // backgrounds. The landing anchors its shader there in `-z-10` so that it leaves
    // from the top of the document — therefore BEHIND the navbar, which is transparent outside
    // of its pellet. Without that, the background would start below the 80 px reserved for the
    // bar and would leave a horizontal seam across the page.
    <div className="relative isolate flex min-h-[100dvh] flex-col bg-background">
      {/* In the desktop app, the public site has nothing to say: we go back to
 the app, which will return to the connection if necessary (MIN-291). */}
      <DesktopMarketingRedirect />
      <AcquisitionContext />
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      {webAnalytics && <Analytics />}
      {webAnalytics && <SpeedInsights />}
    </div>
  );
}
