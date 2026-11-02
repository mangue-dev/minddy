import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Github } from "@/components/git/provider-icons";
import { PlatformDownloadLink } from "./platform-download-link";
import { HeroBoard } from "./figures/hero-board";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";

import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/** Lead with what minddy does for you, over the real board running on its own. */
export async function Hero() {
  const t = await getTranslations("Landing");
  const locale = await getLocale() as Locale;

  return (
    <section className="relative isolate flex min-h-[min(calc(100svh-4rem),56rem)] flex-col overflow-hidden px-4 pt-16 pb-10 sm:px-6 sm:pt-20 sm:pb-12">
      {/* The board, tilted away and filling the whole hero behind the copy. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 flex justify-center">
        <div className="mt-[30rem] origin-top [transform:perspective(1800px)_rotateX(26deg)_scale(var(--board-scale))] [--board-scale:0.62] sm:mt-[19rem] sm:[--board-scale:0.85] lg:mt-[18.5rem] lg:[--board-scale:1.05] 2xl:mt-[19rem] 2xl:[--board-scale:1.3]">
          <HeroBoard />
        </div>
      </div>
      {/* A veil: soft behind the copy and the buttons, clear over the board, faded into the next section. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_42%_24%_at_50%_24%,color-mix(in_oklab,var(--background)_90%,transparent)_55%,transparent_100%),radial-gradient(ellipse_30%_14%_at_50%_100%,var(--background)_40%,transparent_100%),linear-gradient(to_bottom,transparent_88%,var(--background))]"
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h1 className="text-[clamp(2.25rem,4.8vw,4rem)] leading-[1.05] font-medium tracking-[-0.05em] text-balance">
          {t("heroTitle")}
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-pretty text-muted-foreground sm:text-[17px]">
          {t("heroLede")}
        </p>
      </div>
      {/* From sm, at the bottom under the two middle columns, which the board keeps short; on a phone, under the copy. */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-auto sm:pt-10">
        <Button asChild size="lg" className="rounded-full shadow-lg shadow-primary/20">
          <PlatformDownloadLink href={localizedHref("/download", locale)} location="hero" />
        </Button>
        <a
          href={MINDDY_REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-background/80 px-4 text-sm font-medium shadow-sm ring-1 ring-border backdrop-blur transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Github className="size-4" aria-hidden />
          {t("heroCtaSecondary")}
          <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" aria-hidden />
        </a>
      </div>
      <p className="sr-only">{t("heroFlow_alt")}</p>
    </section>
  );
}
