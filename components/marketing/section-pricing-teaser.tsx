import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PricingPlans } from "./pricing-plans";
import { Reveal, RevealHeading } from "./reveal";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/** Price overview on the landing (MIN-73): the same three cards as
 `/pricing`, without the comparison table — which remains the reason to go there. */
export async function SectionPricingTeaser() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mb-10 max-w-2xl sm:mb-12">
          <RevealHeading
            className="max-w-2xl text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("pricingTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mt-3 max-w-xl leading-relaxed text-pretty text-muted-foreground"
          >
            {t("pricingSubtitle")}
          </Reveal>
        </header>

        <Reveal>
          <PricingPlans />
        </Reveal>

        <Reveal delay={0.1} className="mt-8">
          <Link
            href={localizedHref("/pricing", locale as Locale)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("pricingCompareLink")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
