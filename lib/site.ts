/**
 * Identité du site public (MIN-73) — l'URL canonique de minddy, utilisée par les
 * métadonnées (metadataBase, canonical, OpenGraph), le sitemap, le robots.txt et
 * les extraits de configuration MCP affichés sur la landing.
 *
 * L'apex redirige en 308 vers www : c'est `www.minddy.app` qui fait foi.
 */
export const SITE_URL = "https://www.minddy.app";

/**
 * La marque, telle qu'elle apparaît dans un titre d'onglet. Le root layout en
 * fait le template « %s · minddy » ; les rares titres posés côté client (le
 * ticket ouvert en panneau) le recomposent à la main et lisent la même
 * constante.
 */
export const SITE_NAME = "minddy";

/** Point d'entrée du serveur MCP, tel qu'on le colle dans un agent. */
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

export const CONTACT_EMAIL = "hello@minddy.app";

/**
 * Jetons de vérification de propriété (MIN-88), posés en `<meta>` par le root
 * layout. En dur et non en variable d'environnement : ce sont des valeurs
 * publiques, servies dans le HTML de chaque page, et une propriété perdue parce
 * qu'une variable a sauté d'un environnement est un échec silencieux.
 *
 * Chaîne vide = pas encore vérifié, la balise n'est pas émise. On récupère les
 * jetons dans Google Search Console (« Balise HTML ») et Bing Webmaster Tools,
 * puis on les colle ici — le déploiement suivant valide la propriété.
 *
 * Bing accepte aussi l'import direct depuis Search Console une fois Google
 * vérifié, auquel cas `bing` peut rester vide.
 */
export const SITE_VERIFICATION = {
  /** `<meta name="google-site-verification">` */
  google: "",
  /** `<meta name="msvalidate.01">` */
  bing: "",
} as const;
