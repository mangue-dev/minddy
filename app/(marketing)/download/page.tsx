import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AppWindowMac, Bell, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "mangue-ui/components/ui/button";
import { publicPageMetadata } from "@/lib/seo";
import type { Locale } from "@/i18n/config";
import { Reveal, RevealGroup, RevealHeading } from "@/components/marketing/reveal";
import { SectionCta } from "@/components/marketing/section-cta";

/**
 * `/download` — l'app de bureau macOS (MIN-292).
 *
 * Une PAGE et non un bouton sur la landing, pour une raison qui tient en une
 * phrase : il y a quelque chose d'honnête à dire ici, et ça ne tient pas sous un
 * bouton. **App quittée, plus de notification** — Electron n'embarque pas le
 * service de push de Chromium (§3 du cadrage), alors que le site et l'app web
 * installée, eux, sonnent même fermés. Le taire serait la seule malhonnêteté du
 * site ; l'écrire en petit sous un bouton reviendrait au même.
 *
 * **Aucun numéro de version n'est écrit ici.** Le bouton pointe sur
 * `/api/desktop/download`, qui lit le manifeste du flux et redirige. Une version
 * dans une chaîne traduite serait à retoucher dans `messages/en.json` et
 * `messages/fr.json` à chaque publication, et la page mentirait au premier
 * oubli.
 *
 * Rien à câbler côté proxy, sitemap ou app de bureau : l'entrée `download` de
 * [lib/public-routes.ts](../../../lib/public-routes.ts) les sert tous, et
 * `lib/desktop/window-routes.ts` en déduit — c'est le geste juste — que la
 * fenêtre de l'app n'a rien à faire sur sa propre page de téléchargement.
 */

export async function generateMetadata(): Promise<Metadata> {
  return publicPageMetadata({ routeKey: "download", locale: (await getLocale()) as Locale });
}

/** Ce que l'app apporte, dans l'ordre où on s'en aperçoit en l'utilisant. */
const POINTS = [
  { key: "window", icon: AppWindowMac },
  { key: "notifications", icon: Bell },
  { key: "updates", icon: RefreshCw },
] as const;

export default async function DownloadPage() {
  const t = await getTranslations("Download");

  return (
    <>
      {/* ── Le téléchargement ────────────────────────────────────────────── */}
      <section className="pt-24 pb-16 sm:pt-28 sm:pb-20">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <RevealHeading
            as="h1"
            className="mb-4 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl"
            text={t("heroTitle")}
          />
          <Reveal
            as="p"
            delay={0.15}
            className="mb-8 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground"
          >
            {t("heroSubtitle")}
          </Reveal>

          {/* Un `<a>` et non un `<Link>` : la cible n'est pas une page de l'app
              mais une redirection vers un fichier de cent mégaoctets. Un
              préchargement de route n'aurait aucun sens, et `download` sur un
              lien inter-origines n'est pas honoré — le navigateur téléchargera
              de toute façon, c'est le type du fichier qui le dit. */}
          <Reveal delay={0.22} className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild size="lg">
              <a href="/api/desktop/download">
                <Download data-icon="inline-start" />
                {t("downloadButton")}
              </a>
            </Button>
            <a
              href="/api/desktop/download?arch=x64"
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t("downloadIntel")}
            </a>
          </Reveal>

          <Reveal as="p" delay={0.28} className="mt-4 text-sm text-muted-foreground">
            {t("requirements")}
          </Reveal>
        </div>
      </section>

      {/* ── Ce qu'elle apporte ───────────────────────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <RevealGroup as="ul" step={0.08} className="grid gap-8 sm:grid-cols-3">
            {POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.key}>
                  <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h2 className="mb-2 font-medium">{t(`point_${point.key}_title`)}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`point_${point.key}_body`)}
                  </p>
                </li>
              );
            })}
          </RevealGroup>
        </div>
      </section>

      {/* ── Ce qu'elle ne fait pas, et la signature ──────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 sm:px-6 md:grid-cols-2">
          {/* Le renoncement AVANT la réassurance, et à la même taille qu'elle.
              L'inverse — la signature en grand, les notifications en note de bas
              de page — est exactement la mise en page qui donne envie de ne pas
              lire. */}
          <Reveal className="rounded-2xl border border-border bg-muted/30 p-6">
            <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
              <Bell className="h-4 w-4" />
            </span>
            <h2 className="mb-2 font-medium">{t("noticeTitle")}</h2>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {t("noticeBody")}
            </p>
          </Reveal>

          <Reveal delay={0.1} className="rounded-2xl border border-border bg-muted/30 p-6">
            <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <h2 className="mb-2 font-medium">{t("trustTitle")}</h2>
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {t("trustBody")}
            </p>
          </Reveal>
        </div>
      </section>

      <SectionCta />
    </>
  );
}
