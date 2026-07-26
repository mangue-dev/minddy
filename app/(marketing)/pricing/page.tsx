import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PricingPlans } from "@/components/marketing/pricing-plans";
import { PricingComparison } from "@/components/marketing/pricing-comparison";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { SectionCta } from "@/components/marketing/section-cta";

/** Page tarifs publique (MIN-73) : les cartes de plans, le détail ligne à ligne,
    et les seules questions qui portent sur l'argent. */

// Les quatre premières portent sur l'argent ; `mcp` et `byok` ferment les deux
// objections que le tableau laisse ouvertes — brancher SES agents par MCP n'est
// gardé par aucun plan (seul l'agent Numo l'est), et une clé perso lève le
// plafond d'usage sans lever la porte de plan.
const PRICING_FAQ_KEYS = [
  "usage",
  "overage",
  "change",
  "refund",
  "mcp",
  "byok",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Pricing");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/pricing" },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDescription"),
      url: "/pricing",
      type: "website",
    },
  };
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

          <PricingPlans />
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
