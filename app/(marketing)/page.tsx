import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { Hero } from "@/components/marketing/hero";
import { SectionEditions } from "@/components/marketing/section-editions";
import { SectionWorkspace } from "@/components/marketing/section-workspace";
import { SectionAgents } from "@/components/marketing/section-agents";
import { SectionMore } from "@/components/marketing/section-more";
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
      <SectionWorkspace />
      <SectionAgents />
      <SectionMore />
      <SectionEditions />
      <SectionPricingTeaser />
      <SectionFaq />
      <SectionCta />
    </>
  );
}
