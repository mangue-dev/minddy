interface PublicSiteEnvironment {
  appUrl?: string;
  siteName?: string;
  contactEmail?: string;
  productFeedbackUrl?: string;
}

function optionalPublicUrl(value: string | undefined, variable: string): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("invalid");
    }
    return parsed.toString();
  } catch {
    throw new Error(`Invalid ${variable}: expected an absolute http(s) URL without credentials`);
  }
}

/** Configuration publique pure, partagée par le build client et les tests. */
export function resolvePublicSite(env: PublicSiteEnvironment) {
  const rawUrl = env.appUrl?.trim() || "http://localhost:3000";
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "Invalid NEXT_PUBLIC_APP_URL: expected an absolute http(s) origin, for example https://minddy.example.com",
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "Invalid NEXT_PUBLIC_APP_URL: expected an absolute http(s) origin without path, query or credentials",
    );
  }
  return {
    url: parsed.origin,
    name: env.siteName?.trim() || "minddy",
    contactEmail: env.contactEmail?.trim() || "hello@minddy.app",
    productFeedbackUrl: optionalPublicUrl(
      env.productFeedbackUrl,
      "NEXT_PUBLIC_PRODUCT_FEEDBACK_URL",
    ),
  };
}

const publicSite = resolvePublicSite({
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  siteName: process.env.NEXT_PUBLIC_SITE_NAME,
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  productFeedbackUrl: process.env.NEXT_PUBLIC_PRODUCT_FEEDBACK_URL,
});

/** Origine canonique de cette instance, jamais celle de l'infrastructure minddy par défaut. */
export const SITE_URL = publicSite.url;

/**
 * La marque, telle qu'elle apparaît dans un titre d'onglet. Le root layout en
 * fait le template « %s · minddy » ; les rares titres posés côté client (le
 * ticket ouvert en panneau) le recomposent à la main et lisent la même
 * constante.
 */
export const SITE_NAME = publicSite.name;

/** Point d'entrée du serveur MCP, tel qu'on le colle dans un agent. */
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

export const CONTACT_EMAIL = publicSite.contactEmail;

/** Board où l'opérateur souhaite recueillir les retours sur le produit. */
export const PRODUCT_FEEDBACK_URL = publicSite.productFeedbackUrl;

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
