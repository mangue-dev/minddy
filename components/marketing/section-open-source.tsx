import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowUpRight, Server } from "lucide-react";
import { Github } from "@/components/git/provider-icons";
import { Button } from "mangue-ui/components/ui/button";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";
import type { Locale } from "@/i18n/config";
import { localizedHref } from "@/lib/locale-href";
import { Reveal, RevealHeading } from "./reveal";

const POINTS = ["inspect", "selfHost", "contribute"] as const;

export async function SectionOpenSource() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);

  return (
    <section id="open-source" className="scroll-mt-24 border-t border-border py-16 sm:py-24">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        <div>
          <RevealHeading
            className="max-w-lg text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("openSourceTitle")}
          />
          <Reveal
            as="p"
            delay={0.1}
            className="mt-4 max-w-lg leading-relaxed text-pretty text-muted-foreground"
          >
            {t("openSourceSubtitle")}
          </Reveal>

          <Reveal delay={0.2} className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-start xl:flex-row">
            <Button asChild>
              <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noreferrer">
                <Github data-icon="inline-start" />
                {t("openSourceRepository")}
                <ArrowUpRight data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href={localizedHref("/self-hosting", locale as Locale)}>
                <Server data-icon="inline-start" />
                {t("openSourceSelfHost")}
              </Link>
            </Button>
          </Reveal>

          <Reveal
            as="p"
            delay={0.28}
            className="mt-5 text-xs leading-relaxed text-muted-foreground"
          >
            {t("openSourceLicense")}
          </Reveal>
        </div>

        <Reveal as="ul" delay={0.12} className="divide-y divide-border border-y border-border">
            {POINTS.map((point) => (
              <li key={point} className="grid gap-2 py-6 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:py-7">
                <h3 className="font-medium text-foreground">{t(`openSource_${point}_title`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`openSource_${point}_body`)}
                </p>
              </li>
            ))}
        </Reveal>
      </div>
    </section>
  );
}
