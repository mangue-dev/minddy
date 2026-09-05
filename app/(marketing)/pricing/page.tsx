import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/lib/locale-href";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingComparison } from "@/components/marketing/pricing-comparison";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { PRICING_FAQ_KEYS } from "@/components/marketing/faq-keys";
import { SectionHeading } from "@/components/marketing/section-heading";

/** Public Cloud plans, feature comparison, and billing questions. */

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "pricing", locale: (await getLocale()) as Locale });
}

export default async function PricingPage() {
  const [t, tl, locale] = await Promise.all([
    getTranslations("Pricing"),
    getTranslations("Landing"),
    getLocale(),
  ]);

  const faqItems = PRICING_FAQ_KEYS.map((key) => ({
    key,
    question: t(`faq_${key}_q`),
    answer: t(`faq_${key}_a`),
  }));

  return (
    <>
      <StructuredData variant="pricing" />
      <section className="pt-24 pb-12 sm:pt-32 sm:pb-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="mb-12 max-w-3xl sm:mb-16">
            <h1 className="text-[clamp(2.5rem,5.8vw,5rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">
              {t("heroTitle")}
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
              {t("heroSubtitle")}
            </p>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground">
              {t("cloudNotice")}
              <Link href={localizedHref("/self-hosting", locale as Locale)} className="mt-2 block w-fit font-medium text-foreground underline underline-offset-4">
                {t("cloudNoticeCta")}
              </Link>
            </p>
          </header>

          <PricingPlans headingLevel={2} compact />
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <SectionHeading title={t("comparisonTitle")} description={t("comparisonSubtitle")} />

          <PricingComparison />
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <h2 className="mb-8 text-3xl leading-tight font-medium tracking-[-0.035em] text-balance sm:text-4xl">
            {tl("faqTitle")}
          </h2>
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      <SectionCta />
    </>
  );
}
