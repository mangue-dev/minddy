import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "mangue-ui/components/ui/button";
import { Download, ArrowUpRight } from "lucide-react";
import { Github } from "@/components/git/provider-icons";
import { TrackedCta } from "./tracked-cta";
import { ScreenshotSlot } from "./screenshot-slot";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";

import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/** Lead with the workspace itself, using the visitor's language and system theme. */
export async function Hero() {
  const t = await getTranslations("Landing");
  const locale = await getLocale() as Locale;

  return (
    <section className="px-4 pt-30 pb-12 sm:px-6 sm:pt-40 sm:pb-16">
      <div className="mx-auto w-full max-w-6xl">
        <div className="max-w-5xl">
          <h1 className="text-[clamp(2.5rem,5.8vw,5rem)] leading-[1.06] font-medium tracking-[-0.055em] text-balance">
            {t("heroTitleBefore")}
            <span className="mt-1 block text-muted-foreground">{t("heroTitleAccent")}</span>
          </h1>
          <div className="mt-7 flex flex-col gap-7">
            <p className="max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
              {t("heroSubtitle")}
            </p>
            <div className="shrink-0">
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="rounded-lg">
                  <TrackedCta href={localizedHref("/download", locale)} location="hero">
                    {t("downloadMinddy")}
                    <Download data-icon="inline-end" />
                  </TrackedCta>
                </Button>
                <a
                  href={MINDDY_REPOSITORY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <Github className="size-4" aria-hidden />
                  {t("heroCtaSecondary")}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>

        <figure className="mt-10 sm:mt-14">
          <div className="rounded-xl border border-border bg-[#e9ede4] p-2 sm:p-5 dark:bg-[#252c25]">
            <ScreenshotSlot id="heroBoard" priority sizes="(min-width: 1200px) 1108px, calc(100vw - 64px)" className="shadow-lg shadow-black/5" />
          </div>
        </figure>
      </div>
    </section>
  );
}
