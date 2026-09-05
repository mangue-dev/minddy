import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PricingPlans } from "./pricing-plans";
import { SectionHeading } from "./section-heading";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/** The landing shows the plans; detailed comparisons remain on the pricing page. */
export async function SectionPricingTeaser() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);
  return (
    <section id="pricing" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading title={t("pricingTitle")} description={t("pricingSubtitle")} />
        <PricingPlans compact comparisonLink={
          <Link href={localizedHref("/pricing", locale as Locale)}
            className="inline-flex min-h-11 items-center gap-3 rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            {t("pricingCompareLink")}<ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        } />
      </div>
    </section>
  );
}
