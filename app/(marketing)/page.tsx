import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { Hero } from "@/components/marketing/hero";
import { SectionEditions } from "@/components/marketing/section-editions";
import { SectionTracker } from "@/components/marketing/section-tracker";
import { SectionSpeed } from "@/components/marketing/section-speed";
import { SectionAgents } from "@/components/marketing/section-agents";
import { SectionPages } from "@/components/marketing/section-pages";
import { SectionFeedback } from "@/components/marketing/section-feedback";
import { SectionMore } from "@/components/marketing/section-more";
import { SectionOpenSource } from "@/components/marketing/section-open-source";
import { SectionPricingTeaser } from "@/components/marketing/section-pricing-teaser";
import { SectionFaq } from "@/components/marketing/section-faq";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { LandingViewed } from "@/components/marketing/landing-viewed";

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
      <Hero />
      {/* The opening answers the commercial question first: use the managed Cloud
          service or run the same open-source core yourself. The product tour then
          proves the choice through concrete screens and workflows. */}
      <SectionEditions />
      <SectionOpenSource />
      <SectionTracker />
      <SectionAgents />
      <SectionSpeed />
      {/* Pages come before feedback because the following section changes the
          source of the work from the team to its users. */}
      <SectionPages />
      <SectionFeedback />
      <SectionMore />
      <SectionPricingTeaser />
      <SectionFaq />
      <SectionCta />
    </>
  );
}
