import { Analytics } from "@vercel/analytics/next";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { AcquisitionContext } from "@/components/marketing/acquisition-context";
import { resolveCapabilities } from "@/lib/capabilities";

/**
 * Legal pages (notices, CGU, confidentiality, cookies) — accessible without
 * account, hence their presence in PUBLIC_ROUTES of the proxy. They share the
 * chrome of the public site since MIN-73: same navigation, same footer (including
 * the “Legal” column which replaces the old cross navigation). Only the
 * column of text is their own.
 *
 * Vercel Analytics stays scoped to public pages (MIN-323). PostHog handles
 * authenticated audience measurement and Web Vitals throughout the app.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const webAnalytics = resolveCapabilities(process.env).vercelWebAnalytics.configured;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <AcquisitionContext />
      <MarketingNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-10">{children}</main>
      <MarketingFooter />
      {webAnalytics && <Analytics />}
    </div>
  );
}
