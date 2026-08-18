import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingComparison } from "@/components/marketing/pricing-comparison";
import { SectionByok } from "@/components/marketing/section-byok";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { PRICING_FAQ_KEYS } from "@/components/marketing/faq-keys";

/** Public price page (MIN-73): plan maps, line by line details,
 and the only questions that relate to money. */

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "pricing", locale: (await getLocale()) as Locale });
}

export default async function PricingPage() {
  const [t, tl] = await Promise.all([
    getTranslations("Pricing"),
    getTranslations("Landing"),
  ]);

  const faqItems = PRICING_FAQ_KEYS.map((key) => ({
    key,
    question: t(`faq_${key}_q`),
    answer: t(`faq_${key}_a`),
  }));

  return (
    <>
      {/* `Offer` (derived from BILLING_PLANS) + `FAQPage`: the pricing page is
 the only one that can claim a rich result price, and it had
 no structured data (MIN-88). */}
      <StructuredData variant="pricing" />
      <section className="pt-24 pb-16 sm:pt-28 sm:pb-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
            <h1 className="mb-4 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl">
              {t("heroTitle")}
            </h1>
            <p className="text-lg leading-relaxed text-pretty text-muted-foreground">
              {t("heroSubtitle")}
            </p>
          </header>

          {/* On this page the cards directly follow the `<h1>`: they
 take the `h2` level, otherwise the hierarchy jumps a notch. */}
          <PricingPlans headingLevel={2} />
        </div>
      </section>

      {/* Just after the cards, before the board: this is the answer to the
 question that prices just asked (MIN-149). The included usage is
 a convenience; who already has a key does not have to be counted. */}
      <SectionByok />

      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
              {t("comparisonTitle")}
            </h2>
            <p className="leading-relaxed text-pretty text-muted-foreground">
              {t("comparisonSubtitle")}
            </p>
          </header>

          <PricingComparison />
        </div>
      </section>

      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <h2 className="mb-8 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {tl("faqTitle")}
          </h2>
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      {/* Same last reminder as the landing, both component included:
 pages end on the same request. */}
      <SectionCta />
    </>
  );
}
