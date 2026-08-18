import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { CtaShader } from "./hero-shader";
import { TrackedCta } from "./tracked-cta";
import { Reveal, RevealHeading } from "./reveal";

/**
 * Last restart before the footer (MIN-73). Shared by the landing and the page
 * prices: both end on the same request, there is no reason
 * that they should not end on the same screen.
 *
 * One screen, precisely: the section occupies almost the entire height of the viewport
 * and centers its content, with the animated background of the hero behind. This is the only moment on the page, with the hero, where we are not asked to read but to click.
 *
 * `relative isolate`: the shader is a child in `-z-10`, it must remain
 * behind the text of the section without passing behind the background of the page.
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
    <section className="relative isolate flex min-h-[80svh] items-center overflow-hidden border-t border-border py-24 sm:min-h-svh sm:py-32">
      <CtaShader />
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
        <RevealHeading
          className="mb-4 text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
          text={t("ctaTitle")}
        />
        <Reveal
          as="p"
          delay={0.15}
          className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground"
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
