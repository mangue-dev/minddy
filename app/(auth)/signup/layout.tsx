import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { socialMetadata } from "@/lib/seo";

/**
 * `/signup` est publique (le hero, la nav et le pied de page y envoient) mais
 * n'a aucun contenu à indexer : c'est un formulaire. `index: false,
 * follow: true` (MIN-88) — hors des résultats de recherche, mais les liens
 * qu'elle porte restent suivis. Le `canonical` la protège de ses propres
 * variantes (`?redirect=…`, `?invite=…`), qui sont toutes la même page.
 *
 * Jusqu'à MIN-300 cette URL était une redirection 308 vers `/login?mode=signup`
 * déclarée dans `next.config.mjs` ; c'est maintenant une vraie page, et la
 * redirection a été retirée.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [t, ta, locale] = await Promise.all([
    getTranslations("Meta"),
    getTranslations("Auth"),
    getLocale(),
  ]);
  const title = t("signUp");
  const description = ta("signupSubtitle");
  return {
    title,
    description,
    alternates: { canonical: "/signup" },
    robots: { index: false, follow: true },
    // Bloc social explicite : `/signup` est publique et se colle (« inscris-toi
    // ici »), et Next remplace l'objet `openGraph` du parent au lieu de le
    // compléter — sans celui-ci, l'aperçu du lien dirait « minddy — A minimal
    // issue tracker », comme la landing.
    ...socialMetadata({ title, description, url: "/signup", locale: locale as Locale }),
  };
}

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
