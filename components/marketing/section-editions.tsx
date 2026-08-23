import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Cloud, Server } from "lucide-react";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/** A visible choice between the managed service and the public core. */
export async function SectionEditions() {
  const [t, locale] = await Promise.all([getTranslations("Landing"), getLocale()]);
  const href = (path: string) => localizedHref(path, locale as Locale);

  return (
    <section className="border-y border-border bg-muted/20 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <header className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("editionsTitle")}
          </h2>
          <p className="mt-3 leading-relaxed text-pretty text-muted-foreground">
            {t("editionsSubtitle")}
          </p>
        </header>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-primary/25 bg-card p-6 shadow-sm">
            <Cloud className="h-5 w-5 text-primary" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold tracking-tight">{t("cloudTitle")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("cloudBody")}</p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {[t("cloudPointOne"), t("cloudPointTwo"), t("cloudPointThree")].map((point) => (
                <li key={point} className="flex gap-2"><span className="text-primary">✓</span>{point}</li>
              ))}
            </ul>
            <Link href={href("/pricing")} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              {t("cloudCta")}<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>
          <article className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Server className="h-5 w-5 text-primary" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold tracking-tight">{t("selfHostedTitle")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("selfHostedBody")}</p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {[t("selfHostedPointOne"), t("selfHostedPointTwo"), t("selfHostedPointThree")].map((point) => (
                <li key={point} className="flex gap-2"><span className="text-primary">✓</span>{point}</li>
              ))}
            </ul>
            <Link href={href("/self-hosting")} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              {t("selfHostedCta")}<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
