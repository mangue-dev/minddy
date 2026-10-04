import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { AcquisitionContext } from "@/components/marketing/acquisition-context";

/**
 * Legal pages (notices, CGU, confidentiality, cookies) — accessible without
 * account, hence their presence in PUBLIC_ROUTES of the proxy. They share the
 * chrome of the public site since MIN-73: same navigation, same footer (including
 * the “Legal” column which replaces the old cross navigation). Only the
 * column of text is their own.
 *
 * The root PostHog integration measures page traffic and Web Vitals.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <AcquisitionContext />
      <MarketingNav />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-10">{children}</main>
      <MarketingFooter />
    </div>
  );
}
