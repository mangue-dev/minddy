import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { resolveCapabilities } from "@/lib/capabilities";

/**
 * Legal pages (notices, CGU, confidentiality, cookies) — accessible without
 * account, hence their presence in PUBLIC_ROUTES of the proxy. They share the
 * chrome of the public site since MIN-73: same navigation, same footer (including
 * the “Legal” column which replaces the old cross navigation). Only the
 * column of text is their own.
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
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const webAnalytics = resolveCapabilities(process.env).vercelWebAnalytics.configured;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MarketingNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-10">{children}</main>
      <MarketingFooter />
      {webAnalytics && <Analytics />}
      {webAnalytics && <SpeedInsights />}
    </div>
  );
}
