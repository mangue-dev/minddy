import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap : les six pages publiques, dans leurs deux langues — douze URLs
 * (MIN-88). `/login` et `/signup` sont accessibles sans compte mais n'ont pas
 * de contenu propre : les lister diluerait l'index sans rien apporter.
 *
 * Chaque entrée porte ses `alternates.languages`, que Next rend en
 * `<xhtml:link rel="alternate" hreflang="…">`. C'est le pendant obligatoire des
 * `hreflang` du `<head>` : déclarés d'un seul côté, Google signale un « retour
 * manquant » et ignore le groupe — les deux langues redeviennent alors deux
 * pages concurrentes sur les mêmes requêtes.
 *
 * La table des routes (et ses `lastModified` tenus à la main) vit dans
 * `lib/public-routes.ts` : le proxy, les métadonnées et les liens la lisent
 * aussi. `priority` et `changeFrequency` restent parce que Bing les regarde
 * encore un peu ; Google les ignore depuis longtemps.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.flatMap((route) => {
    const languages = {
      en: `${SITE_URL}${route.en}`,
      fr: `${SITE_URL}${route.fr}`,
      "x-default": `${SITE_URL}${route.en}`,
    };

    return ([route.en, route.fr] as const).map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: route.lastModified,
      changeFrequency: "monthly" as const,
      priority: route.priority,
      alternates: { languages },
    }));
  });
}
