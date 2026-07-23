import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PricingPlans } from "./pricing-plans";

/** Aperçu tarifs sur la landing (MIN-73) : les trois mêmes cartes que
    `/pricing`, sans le tableau comparatif — qui reste la raison d'y aller. */
export async function SectionPricingTeaser() {
  const t = await getTranslations("Landing");

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
          <h2 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("pricingTitle")}
          </h2>
          <p className="leading-relaxed text-pretty text-muted-foreground">
            {t("pricingSubtitle")}
          </p>
        </header>

        <PricingPlans />

        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("pricingCompareLink")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
