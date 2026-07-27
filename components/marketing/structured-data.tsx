import { getLocale, getTranslations } from "next-intl/server";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { CONTACT_EMAIL, MCP_ENDPOINT, SITE_URL } from "@/lib/site";
import { routeByKey, type PublicRouteKey } from "@/lib/public-routes";
import type { Locale } from "@/i18n/config";
import { FAQ_KEYS, MCP_FAQ_KEYS, PRICING_FAQ_KEYS } from "./faq-keys";

/**
 * Données structurées du site public (schema.org, JSON-LD).
 *
 * Le `<title>` et le wordmark de la nav suffisent à un humain pour savoir sur
 * quel produit il est tombé ; un analyseur, lui, doit le deviner. Ce graphe
 * donne le nom de l'app et son objet sous forme non ambiguë — c'est exactement
 * ce que vérifie Google au moment de valider le branding de l'écran de
 * consentement OAuth (« le nom d'application configuré ne correspond pas à
 * celui de votre page d'accueil », « votre page d'accueil n'explique pas
 * l'objectif de votre application »).
 *
 * Des nœuds reliés par `@id` plutôt que des blocs indépendants : Google
 * comprend alors qu'il s'agit d'une seule entité vue sous plusieurs angles —
 * l'éditeur, le site, le logiciel.
 *
 * `inLanguage` et `url` suivent la page servie (MIN-88) : `/` et `/fr` sont
 * deux URLs, il faut que le graphe le dise, sinon les deux se déclarent
 * anglaises et le hreflang décrit une réalité que les données structurées
 * contredisent. Les `@id`, eux, restent stables : c'est la même entité.
 *
 * Les prix sont DÉRIVÉS de `BILLING_PLANS`, jamais recopiés : `offers` est le
 * seul champ que Google exploite pour un rich result prix sur une
 * `SoftwareApplication`, et le seul moyen de signaler qu'un palier gratuit
 * existe. Une copie en dur se serait désynchronisée au premier changement de
 * tarif — l'erreur exacte que la landing vient de corriger ailleurs.
 *
 * Le `FAQPage` est construit depuis les mêmes clés que l'accordéon
 * (`faq-keys.ts`) : une question déclarée ici mais absente de la page est une
 * erreur du Rich Results Test, et c'est la seule façon de ne pas l'introduire.
 */

/** Les six domaines du produit, tels que la nav les nomme déjà. */
const FEATURE_KEYS = ["tracker", "speed", "agents", "numo", "feedback", "more"] as const;

const LANG_TAG: Record<Locale, string> = { en: "en-US", fr: "fr-FR" };

/** La page dont le graphe est rendu, par variante. */
const VARIANT_ROUTE: Record<StructuredDataVariant, PublicRouteKey> = {
  landing: "home",
  pricing: "pricing",
  mcp: "mcp",
};

type StructuredDataVariant = "landing" | "pricing" | "mcp";

export async function StructuredData({
  variant = "landing",
}: {
  /**
   * `pricing` et `mcp` remplacent le graphe de la landing par celui de leur
   * propre page. `mcp` rend un `TechArticle` : c'est le type que Google attend
   * d'une documentation d'intégration, et le seul qui dise qu'une page décrit
   * une procédure technique plutôt qu'un argumentaire (MIN-93).
   */
  variant?: StructuredDataVariant;
} = {}) {
  const locale = (await getLocale()) as Locale;
  const [t, tb, tp, tm] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("Billing"),
    getTranslations("Pricing"),
    getTranslations("Mcp"),
  ]);

  const inLanguage = LANG_TAG[locale] ?? LANG_TAG.en;
  const route = routeByKey(VARIANT_ROUTE[variant]);
  const pageUrl = `${SITE_URL}${locale === "fr" ? route.fr : route.en}`;
  const pricingUrl = `${SITE_URL}${
    locale === "fr" ? routeByKey("pricing").fr : routeByKey("pricing").en
  }`;

  const prices = BILLING_PLANS.map((plan) => plan.priceEurMonthly);
  const planNameKey = { free: "planFree", go: "planGo", pro: "planPro" } as const;

  const offers = {
    "@type": "AggregateOffer",
    priceCurrency: "EUR",
    lowPrice: Math.min(...prices),
    highPrice: Math.max(...prices),
    offerCount: BILLING_PLANS.length,
    offers: BILLING_PLANS.map((plan) => ({
      "@type": "Offer",
      name: tb(planNameKey[plan.id]),
      price: plan.priceEurMonthly,
      priceCurrency: "EUR",
      url: pricingUrl,
      // Sans `billingDuration`, un prix mensuel se lit comme un prix unique :
      // P1M dit que les 8 € sont récurrents.
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: plan.priceEurMonthly,
        priceCurrency: "EUR",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "MON",
      },
    })),
  };

  // Chaque variante a ses questions ET son namespace : une question déclarée
  // ici mais absente de la page est une erreur du Rich Results Test.
  const faqKeys: ReadonlyArray<string> =
    variant === "pricing" ? PRICING_FAQ_KEYS : variant === "mcp" ? MCP_FAQ_KEYS : FAQ_KEYS;
  const tFaq =
    variant === "pricing" ? tp : variant === "mcp" ? tm : t;

  const faq = {
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    inLanguage,
    mainEntity: faqKeys.map((key) => ({
      "@type": "Question",
      name: tFaq(`faq_${key}_q`),
      acceptedAnswer: { "@type": "Answer", text: tFaq(`faq_${key}_a`) },
    })),
  };

  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "minddy",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    email: CONTACT_EMAIL,
  };

  /**
   * `/mcp` : un `TechArticle` qui a pour sujet le logiciel, et une
   * `EntryPoint` qui donne l'URL du serveur MCP. C'est la seule page du site
   * dont le contenu est une PROCÉDURE — la décrire comme une `WebPage`
   * ordinaire reviendrait à la ranger avec les pages légales.
   */
  const mcpGraph = [
    organization,
    {
      "@type": "TechArticle",
      "@id": `${pageUrl}#article`,
      url: pageUrl,
      headline: tm("metaTitle"),
      description: tm("metaDescription"),
      inLanguage,
      // Le `lastModified` de la table des routes fait foi partout ailleurs
      // (sitemap compris) : deux dates différentes pour la même page sont un
      // signal contradictoire, et c'est celle-là que Google recoupe.
      dateModified: route.lastModified,
      about: { "@id": `${SITE_URL}/#software` },
      isPartOf: { "@id": `${SITE_URL}/#website` },
      publisher: { "@id": `${SITE_URL}/#organization` },
      proficiencyLevel: "Beginner",
      potentialAction: {
        "@type": "ConsumeAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: MCP_ENDPOINT,
          actionPlatform: "https://modelcontextprotocol.io",
        },
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#software`,
      name: "minddy",
      url: `${SITE_URL}${routeByKey("home")[locale === "fr" ? "fr" : "en"]}`,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      offers,
    },
    faq,
  ];

  const graph =
    variant === "mcp"
      ? mcpGraph
      : variant === "pricing"
      ? [
          organization,
          {
            "@type": "WebPage",
            "@id": `${pageUrl}#webpage`,
            url: pageUrl,
            name: tp("metaTitle"),
            description: tp("metaDescription"),
            inLanguage,
            isPartOf: { "@id": `${SITE_URL}/#website` },
            publisher: { "@id": `${SITE_URL}/#organization` },
            // Les mêmes offres que la landing, sur la page qui les détaille.
            mainEntity: {
              "@type": "SoftwareApplication",
              "@id": `${SITE_URL}/#software`,
              name: "minddy",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Web",
              offers,
            },
          },
          faq,
        ]
      : [
          organization,
          {
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            name: "minddy",
            url: SITE_URL,
            inLanguage,
            publisher: { "@id": `${SITE_URL}/#organization` },
          },
          {
            "@type": "SoftwareApplication",
            "@id": `${SITE_URL}/#software`,
            name: "minddy",
            url: pageUrl,
            description: t("metaDescription"),
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Web",
            inLanguage,
            // Les six domaines du produit, nommés une seule fois — le menu
            // « Produit » de la nav lit les mêmes clés.
            featureList: FEATURE_KEYS.map((key) => t(`navMenu_${key}_title`)),
            publisher: { "@id": `${SITE_URL}/#organization` },
            offers,
          },
          faq,
        ];

  return (
    <script
      type="application/ld+json"
      // Les chaînes viennent des fichiers de traduction, mais un `<` suivi de
      // `/script>` refermerait la balise : on remplace donc tout `<` par son
      // échappement Unicode, que JSON.parse relit comme le caractère d'origine.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": graph,
        }).replaceAll("<", "\\u003c"),
      }}
    />
  );
}
