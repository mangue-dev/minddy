import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, ArrowUpRight, Check, Cloud, Server } from "lucide-react";
import { Github } from "@/components/git/provider-icons";
import { MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { CARD_TONES } from "./card-tones";
import { SectionHeading } from "./section-heading";

/** Two hosting choices share one source code story and one aligned layout. */
export async function SectionEditions() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);
  const href = (path: string) => localizedHref(path, locale as Locale);
  const editions = [
    { title: t("cloudTitle"), body: t("cloudBody"), icon: Cloud, tone: CARD_TONES.sky,
      points: [t("cloudPointOne"), t("cloudPointTwo"), t("cloudPointThree")], href: href("/pricing"), cta: t("cloudCta") },
    { title: t("selfHostedTitle"), body: t("selfHostedBody"), icon: Server, tone: CARD_TONES.lavender,
      points: [t("selfHostedPointOne"), t("selfHostedPointTwo"), t("selfHostedPointThree")], href: href("/self-hosting"), cta: t("selfHostedCta") },
  ];
  return (
    <section id="editions" className="scroll-mt-24 bg-[#e9ede4] px-4 py-16 sm:px-6 sm:py-24 dark:bg-[#252c25]">
      <div id="open-source" className="mx-auto max-w-6xl scroll-mt-24">
        <SectionHeading title={t("editionsTitle")} description={t("editionsSubtitle")} />
        <div className="grid gap-4 md:grid-cols-2">
          {editions.map(edition => (
            <article key={edition.title} className={`flex flex-col rounded-2xl p-7 sm:p-9 ${edition.tone}`}>
              <edition.icon className="mb-8 size-8" strokeWidth={1.5} aria-hidden />
              <h3 className="text-3xl font-medium tracking-tight">{edition.title}</h3>
              <p className="mt-4 max-w-lg leading-relaxed opacity-80">{edition.body}</p>
              <ul className="my-8 space-y-4 text-sm leading-relaxed">
                {edition.points.map(point => <li key={point} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{point}</span></li>)}
              </ul>
              <Link href={edition.href} className="mt-auto inline-flex min-h-12 items-center justify-between gap-4 rounded-lg border border-current/20 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current dark:hover:bg-black/10">
                {edition.cta}<ArrowRight className="size-4 shrink-0" aria-hidden />
              </Link>
            </article>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t("openSourceLicense")}</p>
          <a href={MINDDY_REPOSITORY_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Github className="size-4" aria-hidden />{t("openSourceRepository")}<ArrowUpRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
