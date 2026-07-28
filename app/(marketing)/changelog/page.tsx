import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Rss } from "lucide-react";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import { changelogFeedPath } from "@/lib/changelog-feed";
import { Reveal, RevealHeading } from "@/components/marketing/reveal";
import { SectionCta } from "@/components/marketing/section-cta";
import { ChangelogEntries } from "@/components/changelog-entries";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * `/changelog` — ce qui a été livré, du plus récent au plus ancien (MIN-93).
 *
 * Une page de changelog vaut moins pour ce qu'elle raconte que pour ce qu'elle
 * prouve : que le produit bouge, et à quelle fréquence. C'est aussi la seule
 * page du site dont la fraîcheur est intrinsèque — et la fraîcheur est le
 * premier critère de Perplexity.
 *
 * D'où deux choix : chaque entrée AFFICHE son âge — « il y a deux jours », qui
 * répond à la question qu'on se pose vraiment, la date exacte restant dans le
 * `<time datetime>` que lisent les analyseurs — et le `lastModified` du sitemap
 * est dérivé de la dernière entrée plutôt que tenu à la main.
 *
 * Les entrées viennent de `lib/changelog.ts` — son en-tête explique pourquoi
 * elles sont écrites à la main plutôt que dérivées des issues `done`.
 */

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as Locale;
  const base = await publicPageMetadata({ routeKey: "changelog", locale });

  return {
    ...base,
    alternates: {
      ...base.alternates,
      // Ce que cherche un lecteur de flux — et une partie des crawlers — quand
      // il « découvre » un site : une balise `alternate` dans le `<head>`.
      types: { "application/rss+xml": [{ url: changelogFeedPath(locale), title: "minddy" }] },
    },
  };
}

export default async function ChangelogPage() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("Changelog");

  return (
    <>
      <section className="pt-24 pb-12 sm:pt-28 sm:pb-16">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <RevealHeading
            as="h1"
            className="mb-6 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("heroTitle")}
          />
          {/* Pas de sous-titre : « une entrée par livraison, la plus récente en
              haut » décrivait à voix haute une liste datée qui se lit toute
              seule, dix pixels plus bas. Le titre, le lien du flux, les
              entrées. */}
          <Reveal delay={0.15}>
            <a
              href={changelogFeedPath(locale)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              <Rss className="h-3.5 w-3.5" aria-hidden />
              {t("subscribe")}
            </a>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border py-12 sm:py-16">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          {/* Même liste que le modal « Nouveautés » de l'app, au composant
              près : les deux surfaces disent la même chose. */}
          <ChangelogEntries
            locale={locale}
            entries={CHANGELOG_ENTRIES.map((entry) => ({
              ...entry,
              title: t(`entry_${entry.id}_title` as MessageKey<"Changelog">),
              body: t(`entry_${entry.id}_body` as MessageKey<"Changelog">),
            }))}
          />
        </div>
      </section>

      <SectionCta />
    </>
  );
}
