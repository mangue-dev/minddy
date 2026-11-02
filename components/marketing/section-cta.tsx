import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/lib/locale-href";
import { PlatformDownloadLink } from "./platform-download-link";
import { Reveal, RevealHeading } from "./reveal";

/**
 * Last restart before the footer (MIN-73). Shared by the landing and the page
 * prices: both end on the same request, there is no reason
 * that they should not end on the same screen.
 *
 * The section gives the visitor one clear product action after the objections
 * and pricing have been addressed.
 */
export async function SectionCta() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale() as Promise<Locale>]);

  return (
    <section className="flex min-h-[65svh] items-center bg-[#e9ede4] py-24 sm:min-h-[70svh] sm:py-32 dark:bg-[#252c25]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <RevealHeading
          className="mb-4 max-w-3xl text-3xl font-medium tracking-tighter text-balance sm:text-5xl"
          text={t("ctaTitle")}
        />
        <Reveal
          as="p"
          delay={0.15}
          className="mb-8 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground"
        >
          {t("ctaSubtitle")}
        </Reveal>
        <Reveal delay={0.25}>
          {/* The same download as the hero's, for the visitor's platform. */}
          <Button asChild size="lg" className="rounded-full">
            <PlatformDownloadLink href={localizedHref("/download", locale)} location="cta_section" />
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
