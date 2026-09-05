import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { TrackedCta } from "./tracked-cta";
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
  const t = await getTranslations("Landing");

  return (
    <section className="border-t border-border bg-[#e9ede4] py-20 sm:py-24 dark:bg-[#252c25]">
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
          <Button asChild size="lg">
            <TrackedCta href="/signup" location="cta_section">
              {t("ctaButton")}
              <ArrowRight data-icon="inline-end" />
            </TrackedCta>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
