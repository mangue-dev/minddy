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

  // `svh` and not `vh`: on mobile, `vh` is measured on the LARGE viewport —
  // the one after the URL bar is retracted. A section wedged on top
  // therefore overflows the height of this bar as long as it is deployed,
  // that is to say upon arrival on the page. `svh` takes the viewport SMALL (bar
  // deployed): the section fits on the screen from the outset, and gains air when the
  // bar retracts rather than running out before.
  return (
    <section className="flex min-h-[70svh] items-center overflow-hidden border-t border-border bg-muted/20 py-24 sm:py-32">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <RevealHeading
          className="mb-4 text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
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
