import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { HeroShader } from "@/components/marketing/hero-shader";
import { Hero } from "@/components/marketing/hero";
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
      {/* Background: placed here and not in the hero so that it starts from the top
 of the document and goes behind the navbar. It is anchored to the
 `relative isolate` of the marketing layout (<main> is not positioned). */}
      <HeroShader />
      <Hero />
      {/* Seven sections of content, in the order of the demonstration: the hero
 promises the agent loop, the tracker immediately reassures ("and below,
 it's a real tracker"), the Agents section proves the promise, the
 speed follows, then what enters from the outside, then the reminder that
 the rest is already there.
 Agents passed before Speed (MIN-148): proof must follow the
 promise, not wait two sections. The “Product” menu of the nav reads
 like the map of this page, it follows the same order. */}
      <SectionTracker />
      <SectionAgents />
      <SectionSpeed />
      {/* Pages before returns, not after: the next section
 opens with “so far, everything came from you”. The wiki is the last place where this is still true. */}
      <SectionPages />
      <SectionFeedback />
      <SectionMore />
      <SectionOpenSource />
      <SectionPricingTeaser />
      <SectionFaq />
      <SectionCta />
    </>
  );
}
