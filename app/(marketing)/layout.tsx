import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { DesktopMarketingRedirect } from "@/components/desktop-marketing-redirect";
import { AcquisitionContext } from "@/components/marketing/acquisition-context";
import { resolveCapabilities } from "@/lib/capabilities";

/** Public marketing chrome. Analytics stay scoped to unauthenticated pages. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const webAnalytics = resolveCapabilities(process.env).vercelWebAnalytics.configured;
  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col bg-background text-foreground">
      {/* The desktop shell returns to the app instead of showing the public site. */}
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
