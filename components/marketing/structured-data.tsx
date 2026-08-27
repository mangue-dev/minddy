import { getLocale, getTranslations } from "next-intl/server";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { CONTACT_EMAIL, MCP_ENDPOINT, SITE_URL } from "@/lib/site";
import {
  publicPathForLocale,
  routeByKey, type PublicRouteKey,
} from "@/lib/public-routes";
import type { Locale } from "@/i18n/config";
import { FAQ_KEYS, MCP_FAQ_KEYS, PRICING_FAQ_KEYS } from "./faq-keys";
import type { MessageKey } from "@/lib/i18n-keys";
import { MINDDY_LICENSE_URL, MINDDY_REPOSITORY_URL } from "@/lib/brand-constants";

/**
 * Structured data from the public site (schema.org, JSON-LD).
 *
 * The `<title>` and the wordmark of the nav are enough for a human to know on
 * which product it fell on; an analyzer must guess it. This graph
 * gives the name of the app and its object in unambiguous form — this is exactly
 * what Google checks when validating the branding of the screen of
 * OAuth consent ("the configured application name does not correspond to
 * that of your home page", "your home page does not explain not
 * the objective of your application).
 *
 * Nodes linked by `@id` rather than independent blocks: Google
 * then understands that it is a single entity seen from several angles —
 * the publisher, the site, the software.
 *
 * `inLanguage` and `url` follow the page served (MIN-88): `/` and `/fr` are
 * two URLs, the graph must say so, otherwise both declare
 * English and the hreflang describes a reality that structured data
 * contradicts. The `@id` remain stable: it is the same entity.
 *
 * The prices are DERIVED from `BILLING_PLANS`, never copied: `offers` is the
 * the only field that Google uses for a rich result price on a
 * `SoftwareApplication`, and the only way to signal that a free tier
 * exists. A hard copy would have gone out of sync at the first change of
 * price — the exact error that the landing has just corrected elsewhere.
 *
 * The `FAQPage` is built from the same keys as the accordion
 * (`faq-keys.ts`): a question declared here but absent from the page is a
 * Rich Results Test error, and this is the only way to avoid introducing it.
 */

/** The six areas of the product, as the nav already names them — same order. */
const FEATURE_KEYS = ["tracker", "agents", "numo", "speed", "feedback", "more"] as const;

const LANG_TAG: Record<Locale, string> = { en: "en-US", fr: "fr-FR",
  de: "de-DE",
  "pt-BR": "pt-BR",
  it: "it-IT",
  es: "es-ES",
};

/** The page whose graph is rendered, by variant. */
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
 * `pricing` and `mcp` replace the landing graph with that of their own
 * page. `mcp` returns a `TechArticle`: this is the type that Google expects
 * from integration documentation, and the only one that says that a page describes
 * a technical procedure rather than an argument (MIN-93).
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
  const pageUrl = `${SITE_URL}${publicPathForLocale(route, locale)}`;
  const pricingUrl = `${SITE_URL}${publicPathForLocale(routeByKey("pricing"), locale)}`;

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
      // P1M says that the €8 are recurring.
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

  const downloadUrl = `${SITE_URL}${publicPathForLocale(routeByKey("download"), locale)}`;
  const software = {
    "@type": "SoftwareApplication",
    "@id": `${SITE_URL}/#software`,
    name: "minddy",
    url: `${SITE_URL}${publicPathForLocale(routeByKey("home"), locale)}`,
    description: t("metaDescription"),
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web, macOS, Windows, Linux",
    softwareRequirements:
      "Current web browser; installable progressive web app on iOS, iPadOS, and Android",
    downloadUrl,
    codeRepository: MINDDY_REPOSITORY_URL,
    license: MINDDY_LICENSE_URL,
    isAccessibleForFree: true,
    publisher: { "@id": `${SITE_URL}/#organization` },
    offers,
  };

  // Each variant has its questions AND its namespace: a declared question
  // here but missing from the page is a Rich Results Test error.
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
      name: tFaq(`faq_${key}_q` as MessageKey<"Landing">),
      acceptedAnswer: { "@type": "Answer", text: tFaq(`faq_${key}_a` as MessageKey<"Landing">) },
    })),
  };

  const organization = {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "minddy",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    email: CONTACT_EMAIL,
    sameAs: [MINDDY_REPOSITORY_URL],
  };

  /**
 * `/mcp`: a `TechArticle` which has the software as its subject, and a
 * `EntryPoint` which gives the URL of the MCP server. This is the only page on the site
 * whose content is a PROCEDURE — describing it as an ordinary `WebPage`
 * would be classifying it with the legal pages.
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
      // The `lastModified` of the routes table is valid everywhere else
      // (sitemap included): two different dates for the same page are one
      // contradictory signal, and this is the one that Google matches.
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
    software,
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
            // The same offers as the landing, on the page which details them.
            mainEntity: software,
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
            ...software,
            url: pageUrl,
            inLanguage,
            // The six areas of the product, named only once — the menu
            // “Product” from the nav reads the same keys.
            featureList: FEATURE_KEYS.map((key) => t(`navMenu_${key}_title`)),
          },
          faq,
        ];

  return (
    <script
      type="application/ld+json"
      // The strings come from the translation files, but a `<` followed by
      // `/script>` would close the tag: we therefore replace all `<` with its
      // Unicode escape, which JSON.parse rereads as the original character.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": graph,
        }).replaceAll("<", "\\u003c"),
      }}
    />
  );
}

const DOWNLOAD_PLATFORM_SCHEMA = {
  downloadMacos: { operatingSystem: "macOS", applicationSubCategory: "Native desktop application" },
  downloadLinux: { operatingSystem: "Linux", applicationSubCategory: "Native desktop application" },
  downloadWindows: {
    operatingSystem: "Windows",
    applicationSubCategory: "Native desktop application",
  },
  downloadMobile: {
    operatingSystem: "iOS, iPadOS, Android",
    applicationSubCategory: "Progressive Web App",
  },
} as const satisfies Partial<Record<PublicRouteKey, {
  operatingSystem: string;
  applicationSubCategory: string;
}>>;

type DownloadPlatformRouteKey = keyof typeof DOWNLOAD_PLATFORM_SCHEMA;

/** Software and page entities for a dedicated platform discovery page. */
export async function DownloadPlatformStructuredData({
  routeKey,
}: {
  routeKey: DownloadPlatformRouteKey;
}) {
  const locale = (await getLocale()) as Locale;
  const route = routeByKey(routeKey);
  const t = await getTranslations(route.namespace);
  const pageUrl = `${SITE_URL}${publicPathForLocale(route, locale)}`;
  const platform = DOWNLOAD_PLATFORM_SCHEMA[routeKey];
  const graph = [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "minddy",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.svg`,
      email: CONTACT_EMAIL,
      sameAs: [MINDDY_REPOSITORY_URL],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "minddy",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: t("metaTitle"),
      description: t("metaDescription"),
      inLanguage: LANG_TAG[locale],
      isPartOf: { "@id": `${SITE_URL}/#website` },
      mainEntity: { "@id": `${pageUrl}#software` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${pageUrl}#software`,
      name: "minddy",
      url: pageUrl,
      downloadUrl: pageUrl,
      description: t("metaDescription"),
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: platform.applicationSubCategory,
      operatingSystem: platform.operatingSystem,
      codeRepository: MINDDY_REPOSITORY_URL,
      license: MINDDY_LICENSE_URL,
      isAccessibleForFree: true,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": graph,
        }).replaceAll("<", "\\u003c"),
      }}
    />
  );
}
