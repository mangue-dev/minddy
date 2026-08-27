import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check, Cloud, Server } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";
import { Reveal, RevealHeading } from "./reveal";

/** A visible choice between the managed service and the public core. */
export async function SectionEditions() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);
  const href = (path: string) => localizedHref(path, locale as Locale);

  return (
    <section id="editions" className="scroll-mt-24 border-y border-border bg-muted/20 py-16 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="max-w-2xl">
          <RevealHeading
            className="max-w-2xl text-3xl font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("editionsTitle")}
          />
          <Reveal as="p" delay={0.12} className="mt-3 max-w-xl leading-relaxed text-pretty text-muted-foreground">
            {t("editionsSubtitle")}
          </Reveal>
        </header>
        <div className="mt-10 grid gap-4 md:grid-cols-12">
          <Reveal className="md:col-span-7">
            <article className="flex min-h-[28rem] flex-col rounded-3xl bg-foreground p-7 text-background shadow-sm sm:p-9">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/10">
              <Cloud className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-8 text-3xl font-semibold tracking-tight">{t("cloudTitle")}</h3>
            <p className="mt-3 max-w-lg leading-relaxed text-background/70">{t("cloudBody")}</p>
            <ul className="mt-8 grid gap-3 text-sm text-background/80 sm:grid-cols-2">
              {[t("cloudPointOne"), t("cloudPointTwo"), t("cloudPointThree")].map((point) => (
                <li key={point} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-10">
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-background/20 bg-background text-foreground hover:bg-background/90"
              >
                <Link href={href("/pricing")}>
                  {t("cloudCta")}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </div>
            </article>
          </Reveal>
          <Reveal delay={0.1} className="md:col-span-5">
            <article className="flex min-h-[28rem] flex-col rounded-3xl border border-border bg-card p-7 shadow-sm sm:p-9">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-muted/50 text-primary">
              <Server className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-8 text-3xl font-semibold tracking-tight">{t("selfHostedTitle")}</h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">{t("selfHostedBody")}</p>
            <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
              {[t("selfHostedPointOne"), t("selfHostedPointTwo"), t("selfHostedPointThree")].map((point) => (
                <li key={point} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Link
              href={href("/self-hosting")}
              className="mt-auto inline-flex items-center gap-2 pt-10 text-sm font-medium text-primary hover:underline"
            >
              {t("selfHostedCta")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
