import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "mangue-ui";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
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
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations("Common"), getLocale()]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <MarketingNav />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-lg text-center">
          <p className="mb-4 font-display text-6xl font-semibold tracking-tighter text-muted-foreground/40">
            404
          </p>
          <h1 className="mb-3 text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
            {t("notFoundTitle")}
          </h1>
          <p className="mb-8 leading-relaxed text-pretty text-muted-foreground">
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
