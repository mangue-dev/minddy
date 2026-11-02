import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { Hero } from "@/components/marketing/hero";
import { SectionEditions } from "@/components/marketing/section-editions";
import { SectionAi } from "@/components/marketing/section-ai";
import { SectionTools } from "@/components/marketing/section-tools";
import { SectionTracker } from "@/components/marketing/section-tracker";
import { SectionPages } from "@/components/marketing/section-pages";
import { SectionSpeed } from "@/components/marketing/section-speed";
import { SectionDetails } from "@/components/marketing/section-details";
import { SectionPricingTeaser } from "@/components/marketing/section-pricing-teaser";
import { SectionFaq } from "@/components/marketing/section-faq";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { LandingViewed } from "@/components/marketing/landing-viewed";
import { FigureScope } from "@/components/marketing/figure-scope";

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "home", locale: (await getLocale()) as Locale });
}

/**
 * The bounce "already logged in → /home" has moved to `proxy.ts` (MIN-88).
 * Here, it cost one `auth.getUser()`: a NETWORK round trip to GoTrue
 * before the first byte of the landing, and a page that the CDN could not
 * cache (measured in prod: `cache-control: private, no-store`,
 * `x-vercel-cache: MISS` on each call). Middleware does the same thing by
 * reading the session from the cookies, and it executes BEFORE the cache: the
 * connected are redirected, others receive the cached page. This
 * reading does not constitute authorization; the handlers then check
 * the JWTs before accessing the data.
 */
export default async function LandingPage() {
  return (
    <>
      <StructuredData />
      <LandingViewed />
      {/* The figures render real app components: one scope serves them all. */}
      <FigureScope>
        <Hero />
        {/* What sets minddy apart first, then the foundations it rests on. */}
        <SectionAi />
        <SectionTools />
        <SectionTracker />
        <SectionPages />
        <SectionSpeed />
        <SectionDetails />
      </FigureScope>
      <SectionEditions />
      <SectionPricingTeaser />
      <SectionFaq />
      <SectionCta />
    </>
  );
}
