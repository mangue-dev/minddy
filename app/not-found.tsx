import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "mangue-ui";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { appPageMetadata } from "@/lib/app-metadata";
import { localizedHref } from "@/lib/locale-href";
import type { Locale } from "@/i18n/config";

/**
 * Vraie page 404 (MIN-88).
 *
 * minddy n'en avait aucune, et n'en avait pas besoin : le proxy protégeait
 * « tout sauf une liste blanche », donc `/blog`, `/docs` ou une faute de frappe
 * repartaient en `307 → /login?redirect=…`. Une redirection n'est pas une
 * absence : elle dit au crawler « cette page existe, ailleurs », et l'espace
 * des URLs inexistantes étant infini, le rapport « Page avec redirection » de
 * Search Console l'était aussi. Le proxy protège maintenant une liste noire —
 * ce qui n'y est pas arrive ici, avec un vrai statut 404.
 *
 * Le chrome marketing plutôt qu'un écran nu : on tombe sur cette page depuis
 * l'extérieur, et une nav est ce qui rattrape le visiteur.
 *
 * L'ÉCHELLE EST CELLE DE LA LANDING, pas celle d'une boîte de dialogue. La
 * première version tenait dans un `max-w-lg` avec un titre en `text-3xl` : posée
 * entre la nav et le footer, hauts de leur taille normale, elle se lisait comme
 * une note perdue au milieu d'un écran vide. Le titre reprend donc la mesure du
 * hero (`hero.tsx`), et le nombre devient un vrai élément d'affichage — même
 * recette que le mot-symbole du footer : une taille fluide en `clamp`, un
 * `leading-none` et un tracking resserré, pour qu'il occupe la largeur qu'on lui
 * donne sur un téléphone comme sur un grand écran.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await appPageMetadata("notFound")),
    robots: { index: false, follow: true },
  };
}

export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations("Common"), getLocale()]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MarketingNav />
      <main className="flex flex-1 items-center justify-center px-6 py-20 sm:py-28">
        <div className="mx-auto w-full max-w-2xl text-center">
          <p className="mb-4 font-display text-[clamp(6rem,20vw,13rem)] leading-none font-semibold tracking-[-0.06em] text-muted-foreground/40 sm:mb-6">
            404
          </p>
          <h1 className="mb-4 text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-5xl">
            {t("notFoundTitle")}
          </h1>
          <p className="mb-10 text-lg leading-relaxed text-pretty text-muted-foreground">
            {t("notFoundBody")}
          </p>
          <Button asChild size="lg">
            <Link href={localizedHref("/", locale as Locale)}>{t("notFoundCta")}</Link>
          </Button>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
