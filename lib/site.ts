/**
 * Identité du site public (MIN-73) — l'URL canonique de minddy, utilisée par les
 * métadonnées (metadataBase, canonical, OpenGraph), le sitemap, le robots.txt et
 * les extraits de configuration MCP affichés sur la landing.
 *
 * L'apex redirige en 308 vers www : c'est `www.minddy.app` qui fait foi.
 */
export const SITE_URL = "https://www.minddy.app";

/** Point d'entrée du serveur MCP, tel qu'on le colle dans un agent. */
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

export const CONTACT_EMAIL = "hello@minddy.app";
