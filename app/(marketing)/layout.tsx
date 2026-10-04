import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { DesktopMarketingRedirect } from "@/components/desktop-marketing-redirect";
import { AcquisitionContext } from "@/components/marketing/acquisition-context";

/** Public marketing chrome. The root PostHog integration measures page traffic. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-[100dvh] flex-col bg-background text-foreground">
      {/* The desktop shell returns to the app instead of showing the public site. */}
      <DesktopMarketingRedirect />
      <AcquisitionContext />
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
