import type { NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { PUBLIC_ROUTES, routeByKey, type PublicRouteKey } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";
import { FAQ_KEYS, PRICING_FAQ_KEYS } from "@/components/marketing/faq-keys";

/**
 * Version Markdown des pages publiques (MIN-88), servie sur négociation de
 * contenu : `Accept: text/markdown` sur `/` ou `/fr/tarifs` arrive ici, réécrit
 * par le proxy. Chaque page HTML l'annonce aussi par un en-tête
 * `Link: <…>; rel="alternate"; type="text/markdown"`.
 *
 * **Pourquoi.** Un agent qui veut lire une page paie aujourd'hui 440 Ko de HTML
 * pour en extraire 4 Ko de texte, et doit deviner la structure au passage. Le
 * Markdown lui donne le même contenu, hiérarchisé, sans un octet de balisage
 * inutile. C'est l'un des points que note l'auditeur agentique de Cloudflare, et
 * le seul de sa liste qui coûte quelque chose à produire.
 *
 * **Ce que ça n'est pas.** Pas un miroir octet pour octet du HTML. Le contenu
 * est reconstruit depuis LES MÊMES CLÉS i18n que les composants — donc il ne
 * peut pas raconter autre chose que la page — mais l'ordre et le regroupement
 * sont réécrits pour un lecteur qui lit du texte, pas une mise en page. Les
 * quatre pages légales renvoient leur titre, leur description et un lien : leur
 * corps est de la prose structurée en JSX, le réécrire ici en ferait une
 * deuxième source de vérité juridique, ce qu'on ne veut à aucun prix.
 */

const KEYS = new Set<string>(PUBLIC_ROUTES.map((route) => route.key));

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const rawKey = params.get("route") ?? "";
  const rawLocale = params.get("locale") ?? "";

  const key = (KEYS.has(rawKey) ? rawKey : "home") as PublicRouteKey;
  const locale = ((locales as readonly string[]).includes(rawLocale)
    ? rawLocale
    : defaultLocale) as Locale;

  const route = routeByKey(key);
  const canonical = `${SITE_URL}${locale === "fr" ? route.fr : route.en}`;

  let body: string;
  if (key === "home") body = await renderLanding(locale, canonical);
  else if (key === "pricing") body = await renderPricing(locale, canonical);
  else body = await renderLegal(key, locale, canonical);

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${canonical}>; rel="canonical"`,
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}

function header(title: string, description: string, canonical: string): string {
  return `# ${title}\n\n> ${description}\n\nCanonical: ${canonical}\n`;
}

async function renderLanding(locale: Locale, canonical: string): Promise<string> {
  const t = await getTranslations({ locale, namespace: "Landing" });

  const sections: Array<[string, string, Array<[string, string]>]> = [
    [
      t("featuresTitle"),
      t("featuresSubtitle"),
      [],
    ],
    [t("speedTitle"), t("speedSubtitle"), []],
    [
      t("agentsTitle"),
      t("agentsSubtitle"),
      (
        ["read", "plan", "track", "create", "comment", "review", "beyond"] as const
      ).map((k) => ["", t(`agentsCapability_${k}`)] as [string, string]),
    ],
    [
      t("feedbackTitle"),
      t("feedbackSubtitle"),
      (["post", "moderate", "decide", "status"] as const).map(
        (k) => [t(`feedback_${k}_title`), t(`feedback_${k}_body`)] as [string, string],
      ),
    ],
    [
      t("moreTitle"),
      t("moreSubtitle"),
      (["share", "import", "api"] as const).map(
        (k) => [t(`more_${k}_title`), t(`more_${k}_body`)] as [string, string],
      ),
    ],
    [t("pricingTitle"), t("pricingSubtitle"), []],
  ];

  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `## ${t("heroTitleBefore")} ${t("heroTitleAccent")}`,
    t("heroSubtitle"),
    t("heroNote"),
    ...sections.flatMap(([title, subtitle, items]) => [
      `## ${title}`,
      subtitle,
      ...(items.length
        ? [items.map(([name, body]) => (name ? `- **${name}** — ${body}` : `- ${body}`)).join("\n")]
        : []),
    ]),
    `## ${t("faqTitle")}`,
    FAQ_KEYS.map((k) => `### ${t(`faq_${k}_q`)}\n\n${t(`faq_${k}_a`)}`).join("\n\n"),
    links(locale),
  ].join("\n\n") + "\n";
}

async function renderPricing(locale: Locale, canonical: string): Promise<string> {
  const [t, tb] = await Promise.all([
    getTranslations({ locale, namespace: "Pricing" }),
    getTranslations({ locale, namespace: "Billing" }),
  ]);
  const planNameKey = { free: "planFree", go: "planGo", pro: "planPro" } as const;

  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `## ${t("heroTitle")}`,
    t("heroSubtitle"),
    // Les prix viennent de BILLING_PLANS, jamais d'une copie — même règle que
    // les données structurées.
    BILLING_PLANS.map(
      (plan) => `- **${tb(planNameKey[plan.id])}** — ${plan.priceEurMonthly} EUR / month`,
    ).join("\n"),
    `## ${t("comparisonTitle")}`,
    t("comparisonSubtitle"),
    "## FAQ",
    PRICING_FAQ_KEYS.map((k) => `### ${t(`faq_${k}_q`)}\n\n${t(`faq_${k}_a`)}`).join("\n\n"),
    links(locale),
  ].join("\n\n") + "\n";
}

async function renderLegal(
  key: PublicRouteKey,
  locale: Locale,
  canonical: string,
): Promise<string> {
  const route = routeByKey(key);
  const t = await getTranslations({ locale, namespace: route.namespace });
  return [
    header(t("metaTitle"), t("metaDescription"), canonical),
    `The full text of this page is only published as HTML: ${canonical}`,
    links(locale),
  ].join("\n\n") + "\n";
}

function links(locale: Locale): string {
  const path = (key: PublicRouteKey) => {
    const route = routeByKey(key);
    return `${SITE_URL}${locale === "fr" ? route.fr : route.en}`;
  };
  return [
    "## Links",
    `- Home: ${path("home")}`,
    `- Pricing: ${path("pricing")}`,
    `- MCP integration guide: ${SITE_URL}/llms.txt`,
    `- Terms: ${path("terms")}`,
    `- Privacy: ${path("privacy")}`,
  ].join("\n");
}
