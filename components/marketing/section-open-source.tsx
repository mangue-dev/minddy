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
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="rounded-3xl border border-border bg-card px-6 py-10 sm:px-10 sm:py-14">
          <RevealHeading
            className="mx-auto max-w-2xl text-center text-3xl font-semibold tracking-tighter text-balance sm:text-4xl"
            text={t("openSourceTitle")}
          />
          <Reveal
            as="p"
            delay={0.1}
            className="mx-auto mt-4 max-w-xl text-center leading-relaxed text-pretty text-muted-foreground"
          >
            {t("openSourceSubtitle")}
          </Reveal>

          <Reveal as="ul" delay={0.18} className="mt-10 grid gap-4 sm:grid-cols-3">
            {POINTS.map((point) => (
              <li key={point} className="rounded-2xl border border-border bg-muted/30 p-5">
                <h3 className="font-medium">{t(`openSource_${point}_title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`openSource_${point}_body`)}
                </p>
              </li>
            ))}
          </Reveal>

          <Reveal delay={0.26} className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
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
            delay={0.32}
            className="mt-6 text-center text-xs leading-relaxed text-muted-foreground"
          >
            {t("openSourceLicense")}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
