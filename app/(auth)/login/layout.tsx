import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * `/login` est publique (il faut bien pouvoir s'y connecter) mais n'a aucun
 * contenu à indexer : c'est un formulaire. `index: false, follow: true`
 * (MIN-88) — hors des résultats de recherche, mais les liens qu'elle porte
 * restent suivis. Le `canonical` la protège de ses propres variantes
 * (`?redirect=…`, `?mode=signup`), qui sont toutes la même page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, ta] = await Promise.all([
    getTranslations("Meta"),
    getTranslations("Auth"),
  ]);
  return {
    title: t("signIn"),
    description: ta("loginSubtitle"),
    alternates: { canonical: "/login" },
    robots: { index: false, follow: true },
  };
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
