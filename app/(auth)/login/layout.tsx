import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { socialMetadata } from "@/lib/seo";

/**
 * `/login` est publique (il faut bien pouvoir s'y connecter) mais n'a aucun
 * contenu à indexer : c'est un formulaire. `index: false, follow: true`
 * (MIN-88) — hors des résultats de recherche, mais les liens qu'elle porte
 * restent suivis. Le `canonical` la protège de ses propres variantes
 * (`?redirect=…`, `?mode=signup`), qui sont toutes la même page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, ta, locale] = await Promise.all([
    getTranslations("Meta"),
    getTranslations("Auth"),
    getLocale(),
  ]);
  const title = t("signIn");
  const description = ta("loginSubtitle");
  return {
    title,
    description,
    alternates: { canonical: "/login" },
    robots: { index: false, follow: true },
    // Bloc social explicite : `/login` est publique et se colle (« inscris-toi
    // ici »), et Next remplace l'objet `openGraph` du parent au lieu de le
    // compléter — sans celui-ci, l'aperçu du lien disait « minddy — A minimal
    // issue tracker », comme la landing.
    ...socialMetadata({ title, description, url: "/login", locale: locale as Locale }),
  };
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
