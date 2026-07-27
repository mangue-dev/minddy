import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingComparison } from "@/components/marketing/pricing-comparison";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { SectionCta } from "@/components/marketing/section-cta";
import { StructuredData } from "@/components/marketing/structured-data";
import { PRICING_FAQ_KEYS } from "@/components/marketing/faq-keys";

/** Page tarifs publique (MIN-73) : les cartes de plans, le détail ligne à ligne,
    et les seules questions qui portent sur l'argent. */

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
      {/* `Offer` (dérivées de BILLING_PLANS) + `FAQPage` : la page tarifs est
          la seule qui puisse prétendre à un rich result prix, et elle n'avait
          aucune donnée structurée (MIN-88). */}
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

          {/* Sur cette page les cartes suivent directement le `<h1>` : elles
              prennent le niveau `h2`, sinon la hiérarchie saute un cran. */}
          <PricingPlans headingLevel={2} />
        </div>
      </section>

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

      {/* Même dernière relance que la landing, composant compris : les deux
          pages se terminent sur la même demande. */}
      <SectionCta />
    </>
  );
}
