import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Button } from "mangue-ui";
import { TrackedCta } from "./tracked-cta";

/** Dernière relance avant le footer (MIN-73). */
export async function SectionCta() {
  const t = await getTranslations("Landing");

  return (
    <section className="border-t border-border py-16 sm:py-24">
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6">
        <h2 className="mb-4 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
          {t("ctaTitle")}
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
          {t("ctaSubtitle")}
        </p>
        <Button asChild size="lg">
          <TrackedCta href="/signup" location="cta_section">
            {t("ctaButton")}
            <ArrowRight data-icon="inline-end" />
          </TrackedCta>
        </Button>
      </div>
    </section>
  );
}
