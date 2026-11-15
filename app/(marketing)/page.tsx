import type { ReactNode } from "react";
import type { Metadata } from "next";
import { cn } from "@/lib/utils";
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
        <Deferred size={SIZE.ai}><SectionAi /></Deferred>
        <Deferred size={SIZE.tools}><SectionTools /></Deferred>
        <Deferred size={SIZE.tracker}><SectionTracker /></Deferred>
        <Deferred size={SIZE.pages}><SectionPages /></Deferred>
        <Deferred size={SIZE.speed}><SectionSpeed /></Deferred>
        <Deferred size={SIZE.details}><SectionDetails /></Deferred>
      </FigureScope>
      <Deferred size={SIZE.editions}><SectionEditions /></Deferred>
      <Deferred size={SIZE.pricing}><SectionPricingTeaser /></Deferred>
      <Deferred size={SIZE.faq}><SectionFaq /></Deferred>
      <Deferred size={SIZE.cta}><SectionCta /></Deferred>
    </>
  );
}

/**
 * Each section's height estimate, phone then `sm:` and up, measured on the
 * rendered landing (390 and 1280 px wide). The browser reserves it while the section is far from the
 * viewport, then remembers the real height (`auto`) once it has been laid
 * out; a close estimate keeps the scrollbar and `#anchor` jumps steady.
 * Tailwind reads class names literally, so they are written out in full.
 */
const SIZE = {
  ai: "[contain-intrinsic-size:auto_none_auto_2620px] sm:[contain-intrinsic-size:auto_none_auto_1530px]",
  tools: "[contain-intrinsic-size:auto_none_auto_3240px] sm:[contain-intrinsic-size:auto_none_auto_1490px]",
  tracker: "[contain-intrinsic-size:auto_none_auto_2770px] sm:[contain-intrinsic-size:auto_none_auto_1540px]",
  pages: "[contain-intrinsic-size:auto_none_auto_2820px] sm:[contain-intrinsic-size:auto_none_auto_1610px]",
  speed: "[contain-intrinsic-size:auto_none_auto_1250px] sm:[contain-intrinsic-size:auto_none_auto_780px]",
  details: "[contain-intrinsic-size:auto_none_auto_2060px] sm:[contain-intrinsic-size:auto_none_auto_920px]",
  editions: "[contain-intrinsic-size:auto_none_auto_1890px] sm:[contain-intrinsic-size:auto_none_auto_1130px]",
  pricing: "[contain-intrinsic-size:auto_none_auto_2440px] sm:[contain-intrinsic-size:auto_none_auto_1080px]",
  faq: "[contain-intrinsic-size:auto_none_auto_730px] sm:[contain-intrinsic-size:auto_none_auto_780px]",
  cta: "[contain-intrinsic-size:auto_none_auto_550px] sm:[contain-intrinsic-size:auto_none_auto_630px]",
} as const;

/**
 * A landing section below the hero, rendered only as it nears the viewport
 * (`content-visibility: auto`): the figures are real app components, and
 * laying out all ten up front delays the first interaction. The content stays
 * in the HTML, so find-in-page, `#anchor` links and focus still reach it; the
 * hero is never wrapped, being what the first paint shows.
 */
function Deferred({ size, children }: { size: string; children: ReactNode }) {
  return <div className={cn("[content-visibility:auto]", size)}>{children}</div>;
}
