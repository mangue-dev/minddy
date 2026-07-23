import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, Plug } from "lucide-react";
import { Button } from "mangue-ui";
import { HeroShader } from "./hero-shader";
import { ScreenshotSlot } from "./screenshot-slot";

/**
 * Hero de la landing (MIN-73). Promesse en une phrase, deux actions, la capture
 * du produit. Le mot accentué passe en Instrument Serif italique — la même
 * respiration typographique que le reste de la marque.
 */
export async function Hero() {
  const t = await getTranslations("Landing");

  return (
    <section className="relative isolate overflow-hidden pt-20 pb-16 sm:pb-24">
      <HeroShader />

      <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl pt-10 text-center sm:pt-16">
          <Link
            href="/#agents"
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
          >
            <Plug className="h-3.5 w-3.5" />
            {t("heroBadge")}
          </Link>

          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-6xl">
            {t("heroTitleBefore")}{" "}
            <span className="font-serif font-normal italic">{t("heroTitleAccent")}</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            {t("heroSubtitle")}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">
                {t("heroCtaPrimary")}
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">{t("heroCtaSecondary")}</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">{t("heroNote")}</p>
        </div>

        <div className="mt-14 sm:mt-20">
          <ScreenshotSlot id="heroBoard" priority />
        </div>
      </div>
    </section>
  );
}
